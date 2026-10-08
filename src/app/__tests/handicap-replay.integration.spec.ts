import { createPaymentBypassCode } from '../services/paymentBypassCode';
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../app';
import { prisma } from '../../prisma';
import { SeasonSync } from '../services/seasonSync';
import { backfillLeagueHandicaps } from '../services/handicapBackfill';
import { loadPreviousHandicapHistory, toHandicapSourceRound } from '../services/playerHandicapHistory';

const createFixture = async (basis: 9 | 18, renewal?: { id: number; email: string }) => {
  const admin = await prisma.user.create({ data: { firstName: 'Handicap', lastName: 'Test', email: `handicap-${crypto.randomUUID()}@test.com`, password: await bcrypt.hash('integration-test-password', 10), role: 'ADMIN', emailVerifiedAt: new Date() } });
  const entitlement = await prisma.league_season_entitlement.create({ data: { billingOwnerId: admin.id, draftKey: crypto.randomUUID(), requiredGolfers: 1, paidGolfers: 1, status: 'paid' } });
  const league = await prisma.league.create({ data: {
    name: 'Handicap replay fixture', type: 'season', format: 'individual', holeFormat: String(basis), handicapHoleBasis: basis, handicapBestRounds: 5, handicapWindow: 8, adminId: admin.id,
    entitlementId: entitlement.id, startDate: new Date('2026-01-01'), endDate: new Date('2027-01-01'),
    contactFirstName: 'Handicap', contactLastName: 'Test', contactEmail: admin.email, renewedFromLeagueId: renewal?.id,
  } });
  const club = await prisma.club.create({ data: { name: 'Handicap test club' } });
  const course = await prisma.course.create({ data: { clubId: club.id, name: 'Handicap test course', par: basis * 4, numHoles: basis } });
  const tee = await prisma.tee.create({ data: { courseId: course.id, name: 'Test tees', color: 'white', distance: 3000, par: basis * 4,
    frontPar: 36, backPar: basis === 18 ? 36 : 0, ratingMen: basis * 4, slopeMen: 113,
    ratingFrontMen: 36, slopeFrontMen: 113, ratingBackMen: 36, slopeBackMen: 113,
    holes: Array.from({ length: basis }, (_, index) => ({ num: index + 1, par: 4, hcp: index + 1, yards: 300 })),
  } });
  const player = await prisma.player.create({ data: { leagueId: league.id, firstName: 'Actual', lastName: 'Scores', email: renewal?.email ?? `player-${crypto.randomUUID()}@test.com`, handicap: 11, startingHandicap: 11, seasonPoints: 0, gender: 'male' } });
  return { league, course, tee, player };
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const addEvent = (fixture: Fixture, sequence: number, holes: 9 | 18 = 9) =>
  prisma.event.create({ data: { leagueId: fixture.league.id, courseId: fixture.course.id, teeId: fixture.tee.id,
    name: `Handicap round ${sequence}`, format: 'individual', type: 'regular', holes, startSide: 'front',
    startsAt: new Date(Date.UTC(2026, 0, sequence, 15)), timeZone: 'UTC', interval: 10, status: 'completed',
    scoringMode: 'stroke-play', strokePoints: [4, 2, 1],
  } });

const addRound = async (fixture: Fixture, sequence: number, extra: number, holes: 9 | 18 = 9) => {
  const event = await addEvent(fixture, sequence, holes);
  return prisma.round.create({ data: { eventId: event.id, playerId: fixture.player.id, courseId: fixture.course.id, teeId: fixture.tee.id,
    date: event.startsAt, status: 'completed', holesPlayed: holes, gross: holes * 4 + extra, net: 0, adjusted: 0, putts: 0,
    courseRating: holes * 4, courseSlope: 113, pointsEarned: 0, eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubleBogeys: 0, tripleBogeys: 0,
    scores: { create: Array.from({ length: holes }, (_, index) => ({ hole: index + 1, par: 4, gross: 4 + Math.floor(extra / holes) + (index < extra % holes ? 1 : 0), net: 0, adjusted: 0 })) },
  } });
};

const prepareScoringEvent = async (fixture: Fixture, sequence: number) => {
  const event = await addEvent(fixture, sequence);
  await prisma.event.update({ where: { id: event.id }, data: { status: 'active' } });
  const flight = await prisma.flight.create({ data: { eventId: event.id, startsAt: event.startsAt, status: 'not_started',
    players: { create: { playerId: fixture.player.id } },
  } });
  return { event, flight };
};

const logIn = async (fixture: Fixture) => {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email: fixture.league.contactEmail, password: 'integration-test-password' });
  expect(response.status).toBe(200);
  return agent;
};

describe('configurable handicap replay and API scoring', () => {
  afterAll(() => prisma.$disconnect());
  const read = (fixture: Fixture) => prisma.player.findUniqueOrThrow({ where: { id: fixture.player.id } });
  const url = (fixture: Fixture, eventId: number) => `/api/leagues/${fixture.league.id}/events/${eventId}`;
  const scores = (extra: number) => Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, 4 + Math.floor(extra / 9) + (index < extra % 9 ? 1 : 0)]));
  const submission = (fixture: Fixture, flightId: number, extra: number) => ({ flightId, players: [{ playerId: fixture.player.id, scores: scores(extra) }] });

  it('redeems a free code for one trial league and cannot reuse it for another league', async () => {
    const fixture = await createFixture(9);
    const other = await createFixture(9);
    await prisma.league_season_entitlement.update({where:{id:fixture.league.entitlementId},data:{status:'trialing',trialEventCount:3}});
    const {code,record} = await createPaymentBypassCode(fixture.league.adminId,{label:'One season'});
    const agent = await logIn(fixture);
    const first = await prepareScoringEvent(fixture,1);
    expect((await agent.get(url(fixture,first.event.id))).body.trialLimitMessage).not.toBeNull();
    expect((await agent.post('/api/payments/bypass-code').send({code,leagueId:other.league.id})).status).toBe(400);
    expect((await prisma.payment_bypass_code.findUniqueOrThrow({where:{id:record.id}})).redeemedAt).toBeNull();
    const redeemed = await agent.post('/api/payments/bypass-code').send({code:code.toLowerCase(),leagueId:fixture.league.id});
    expect(redeemed.status,JSON.stringify(redeemed.body)).toBe(200);
    expect(redeemed.body.billing).toMatchObject({paymentExempt:false,hasPendingLeagueBypass:false});
    expect((await prisma.league_season_entitlement.findUniqueOrThrow({where:{id:fixture.league.entitlementId}})).status).toBe('bypassed');
    expect((await prisma.league_season_entitlement.findUniqueOrThrow({where:{id:other.league.entitlementId}})).status).toBe('paid');
    expect(await prisma.payment_bypass_code.findUniqueOrThrow({where:{id:record.id}})).toMatchObject({redeemedById:fixture.league.adminId,redeemedLeagueId:fixture.league.id});
    expect((await agent.get(url(fixture,first.event.id))).body.trialLimitMessage).toBeNull();
    expect((await agent.post(`${url(fixture,first.event.id)}/scores`).send(submission(fixture,first.flight.id,9))).status).toBe(201);
    expect((await agent.post('/api/payments/bypass-code').send({code,leagueId:fixture.league.id})).status).toBe(400);
  });

  it('blocks new score entry before the form opens after the trial is used', async () => {
    const fixture = await createFixture(9);
    await prisma.league_season_entitlement.update({where:{id:fixture.league.entitlementId},data:{status:'trialing',trialEventCount:3,trialEventLimit:3}});
    const agent = await logIn(fixture);
    const first = await prepareScoringEvent(fixture,1);
    const preview = await agent.get(url(fixture,first.event.id));
    expect(preview.status).toBe(200);
    expect(preview.body.trialLimitMessage).toContain('Activate this league');
    expect(await prisma.round.count({where:{eventId:first.event.id}})).toBe(0);
    await prisma.trial_scored_event.create({data:{entitlementId:fixture.league.entitlementId,eventId:first.event.id}});
    expect((await agent.get(url(fixture,first.event.id))).body.trialLimitMessage).toBeNull();
    const next = await prepareScoringEvent(fixture,2);
    expect((await agent.get(url(fixture,next.event.id))).body.trialLimitMessage).not.toBeNull();
    await prisma.league_season_entitlement.update({where:{id:fixture.league.entitlementId},data:{status:'paid'}});
    expect((await agent.get(url(fixture,next.event.id))).body.trialLimitMessage).toBeNull();
  });

  it('applies a saved league multiplier to first-event scoring and future calculations', async () => {
    const fixture = await createFixture(9);
    await prisma.league.update({where:{id:fixture.league.id},data:{handicapMultiplier:0.96}});
    await prisma.player.update({where:{id:fixture.player.id},data:{handicap:null,startingHandicap:null}});
    const agent = await logIn(fixture);
    const first = await prepareScoringEvent(fixture, 1);
    const preview = await agent.get(url(fixture, first.event.id));
    expect(preview.body.flights[0].players[0].firstRoundHandicap.handicapMultiplier).toBe(0.96);
    expect((await agent.post(`${url(fixture, first.event.id)}/scores`).send(submission(fixture,first.flight.id,9))).status).toBe(201);
    expect(await prisma.round.findFirstOrThrow({where:{eventId:first.event.id}})).toMatchObject({gross:45,differential:9,scoringHandicap:8.64,postHandicap:8.64,net:36});
    const second = await prepareScoringEvent(fixture, 2);
    expect((await agent.post(`${url(fixture, second.event.id)}/scores`).send(submission(fixture,second.flight.id,3))).status).toBe(201);
    expect((await read(fixture)).handicap).toBe(5.76);
    const stats = await agent.get(`/api/leagues/${fixture.league.id}/players/${fixture.player.id}/stats`);
    expect(stats.body.handicapCalculation).toMatchObject({multiplier:0.96,average:6,index:5.76});
    expect((await agent.put(`/api/leagues/${fixture.league.id}`).send({handicapMultiplier:1})).status).toBe(409);
    expect((await agent.put(`/api/leagues/${fixture.league.id}`).send({handicapMultiplier:2})).status).toBe(400);
  });

  it('creates a first-event handicap from unknown, scores that event and preserves a null pre-handicap', async () => {
    const fixture = await createFixture(9);
    await prisma.player.update({ where: { id: fixture.player.id }, data: { handicap: null, startingHandicap: null } });
    const agent = await logIn(fixture);
    const first = await prepareScoringEvent(fixture, 1);
    const preview = await agent.get(url(fixture, first.event.id));
    expect(preview.body.flights[0].players[0].handicapIndex).toBeNull();
    expect(preview.body.flights[0].players[0].firstRoundHandicap).toMatchObject({ handicapHoleBasis:9, rating:36, slope:113, handicapHoleLimit:"handicap-adjusted" });
    const saved = await agent.post(`${url(fixture, first.event.id)}/scores`).send(submission(fixture, first.flight.id, 9));
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    const round = await prisma.round.findFirstOrThrow({ where: { eventId: first.event.id, playerId: fixture.player.id } });
    expect(round).toMatchObject({ gross: 45, adjusted: 45, differential: 9, preHandicap: null, scoringHandicap: 9, playingHandicap: 9, postHandicap: 9, net: 36, competitionNet: 36, pointsEarned: 4 });
    expect((await read(fixture)).handicap).toBe(9);
    const second = await prepareScoringEvent(fixture, 2);
    expect((await agent.get(url(fixture, second.event.id))).body.flights[0].players[0].handicapIndex).toBe(9);
    expect((await agent.get(url(fixture, first.event.id))).body.flights[0].players[0].handicapIndex).toBe(9);
    const edited = await agent.put(`${url(fixture, first.event.id)}/scores`).send(submission(fixture, first.flight.id, 6));
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(await prisma.round.findUniqueOrThrow({ where: { id: round.id } })).toMatchObject({ preHandicap: null, scoringHandicap: 6, net: 36, postHandicap: 6 });
  });

  it.each(['stableford', 'match-play'] as const)('uses the generated first-event handicap for %s points', async (mode) => {
    const fixture = await createFixture(9);
    await prisma.player.update({where:{id:fixture.player.id},data:{handicap:null,startingHandicap:null}});
    const first = await prepareScoringEvent(fixture,1);
    await prisma.event.update({where:{id:first.event.id},data:{scoringMode:mode,scoringConfig:{handicapAllowance:1},pointsEnabled:true,ptsPerHole:1,ptsPerMatch:2}});
    const agent = await logIn(fixture);
    const payload: {flightId:number;players:Array<{playerId:number;scores:Record<string,number>;opponentId?:number}>} = submission(fixture,first.flight.id,9);
    if (mode === 'match-play') {
      const opponent = await prisma.player.create({data:{leagueId:fixture.league.id,firstName:'Scratch',lastName:'Opponent',gender:'male',handicap:0,startingHandicap:0,seasonPoints:0}});
      await prisma.flight_player.updateMany({where:{flightId:first.flight.id,playerId:fixture.player.id},data:{opponentId:opponent.id}});
      await prisma.flight_player.create({data:{flightId:first.flight.id,playerId:opponent.id,opponentId:fixture.player.id}});
      payload.players[0].opponentId = opponent.id;
      payload.players.push({playerId:opponent.id,scores:scores(9),opponentId:fixture.player.id});
    }
    const response = await agent.post(`${url(fixture,first.event.id)}/scores`).send(payload);
    expect(response.status,JSON.stringify(response.body)).toBe(201);
    const round = await prisma.round.findFirstOrThrow({where:{eventId:first.event.id,playerId:fixture.player.id}});
    expect(round.scoringHandicap).toBe(9);
    expect(round.net).toBe(36);
    expect(round.pointsEarned).toBe(mode === 'stableford' ? 18 : 9);
    expect(round.matchPoints).toBe(mode === 'match-play' ? 2 : 0);
  });

  it('uses the generated first-round handicap in best-ball team placement', async () => {
    const fixture = await createFixture(9);
    await prisma.league.update({where:{id:fixture.league.id},data:{format:'team',teamPlayersPerEvent:2}});
    await prisma.league_season_entitlement.update({where:{id:fixture.league.entitlementId},data:{requiredGolfers:4,paidGolfers:4}});
    const teamA = await prisma.team.create({data:{leagueId:fixture.league.id,name:'A',seasonPoints:0}});
    const teamB = await prisma.team.create({data:{leagueId:fixture.league.id,name:'B',seasonPoints:0}});
    await prisma.player.update({where:{id:fixture.player.id},data:{handicap:null,startingHandicap:null,teamId:teamA.id}});
    const others = await Promise.all([teamA.id,teamB.id,teamB.id].map((teamId,index) => prisma.player.create({data:{leagueId:fixture.league.id,teamId,firstName:'Scratch',lastName:String(index),gender:'male',handicap:0,startingHandicap:0,seasonPoints:0}})));
    const first = await prepareScoringEvent(fixture,1);
    await prisma.event.update({where:{id:first.event.id},data:{format:'team',scoringMode:'best-ball',scoringConfig:{handicapAllowance:1},pointsEnabled:true}});
    await prisma.flight_team.createMany({data:[teamA.id,teamB.id].map(teamId => ({flightId:first.flight.id,teamId}))});
    await prisma.flight_player.updateMany({where:{flightId:first.flight.id,playerId:fixture.player.id},data:{teamId:teamA.id}});
    await prisma.flight_player.createMany({data:others.map(player=>({flightId:first.flight.id,playerId:player.id,teamId:player.teamId}))});
    const agent = await logIn(fixture);
    const response = await agent.post(`${url(fixture,first.event.id)}/scores`).send({flightId:first.flight.id,players:[fixture.player,...others].map(player=>({playerId:player.id,scores:scores(9)}))});
    expect(response.status,JSON.stringify(response.body)).toBe(201);
    expect(await prisma.round.findFirstOrThrow({where:{eventId:first.event.id,playerId:fixture.player.id}})).toMatchObject({scoringHandicap:9,net:36});
    expect(await prisma.team_event_points.findFirstOrThrow({where:{eventId:first.event.id,teamId:teamA.id}})).toMatchObject({points:4});
    expect(await prisma.team_event_points.findFirstOrThrow({where:{eventId:first.event.id,teamId:teamB.id}})).toMatchObject({points:2});
  });

  it('returns to averaging all remaining rounds after cancellation crosses X', async () => {
    const fixture = await createFixture(9);
    await prisma.league.update({where:{id:fixture.league.id},data:{handicapHoleLimit:'none'}});
    const history = [];
    for (const [index,extra] of [4,6,8,10,12,20].entries()) history.push(await addRound(fixture,index+1,extra));
    await SeasonSync.recalculateLeague(fixture.league.id);
    expect((await read(fixture)).handicap).toBe(8);
    await prisma.event.update({where:{id:history[0].eventId},data:{status:'canceled'}});
    await SeasonSync.recalculateLeague(fixture.league.id);
    expect((await read(fixture)).handicap).toBe(11.2);
  });

  it('uses a supplied scratch handicap for the first event, then updates for subsequent events', async () => {
    const fixture = await createFixture(9);
    await prisma.player.update({ where: { id: fixture.player.id }, data: { handicap: 0, startingHandicap: 0 } });
    const first = await addRound(fixture, 1, 9);
    await SeasonSync.recalculateLeague(fixture.league.id);
    expect(await prisma.round.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ preHandicap: 0, scoringHandicap: 0, net: 45, postHandicap: 9 });
  });

  it('persists initial averages and best-five selection as the eight-round window fills and rolls', async () => {
    const fixture = await createFixture(9);
    for (const [index, extra] of [9, 11, 8, 13, 10, 12, 7, 14, 16].entries()) await addRound(fixture, index + 1, extra);
    await SeasonSync.recalculateLeague(fixture.league.id);
    const history = await prisma.round.findMany({ where: { playerId: fixture.player.id }, orderBy: { date: 'asc' } });
    expect(history.map((round) => round.postHandicap)).toEqual([9, 10, 9.33, 10.25, 10.2, 10, 9, 9, 9.6]);
    const agent = await logIn(fixture);
    const stats = await agent.get(`/api/leagues/${fixture.league.id}/players/${fixture.player.id}/stats`);
    expect(stats.status, JSON.stringify(stats.body)).toBe(200);
    expect(stats.body.handicapCalculation).toMatchObject({ index: 9.6, storedHandicap: 9.6, bestRounds: 5, historyWindow: 8, eligibleRounds: 9 });
    expect(stats.body.handicapCalculation.usedEntries).toHaveLength(5);
    expect(stats.body.handicapCalculation.entries).toHaveLength(8);
    await prisma.round.updateMany({ where: { playerId: fixture.player.id, id: { in: history.slice(3).map((round) => round.id) } }, data: { deletedAt: new Date() } });
    await SeasonSync.recalculateLeague(fixture.league.id);
    expect((await read(fixture)).handicap).toBe(9.33);
    await prisma.round.updateMany({ where: { playerId: fixture.player.id }, data: { deletedAt: new Date() } });
    await SeasonSync.recalculateLeague(fixture.league.id);
    expect((await read(fixture)).handicap).toBe(11);
  });

  it('normalizes mixed nines and eighteens immediately without pairing or pending entries', async () => {
    const fixture = await createFixture(18);
    await prisma.league.update({ where: { id: fixture.league.id }, data: { holeFormat: 'mixed' } });
    const first = await addRound(fixture, 1, 5, 9);
    const second = await addRound(fixture, 2, 12, 18);
    await SeasonSync.recalculateLeague(fixture.league.id);
    expect(await prisma.round.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ differential: 10, postHandicap: 10 });
    expect(await prisma.round.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ differential: 12, postHandicap: 11 });
  });

  it('applies the configured limit before the first handicap without circular adjustment', async () => {
    const fixture = await createFixture(9);
    await prisma.player.update({ where: { id: fixture.player.id }, data: { handicap: null, startingHandicap: null } });
    const round = await addRound(fixture, 1, 54);
    await SeasonSync.recalculateLeague(fixture.league.id);
    expect(await prisma.round.findUniqueOrThrow({ where: { id: round.id } })).toMatchObject({ gross: 90, adjusted: 81, differential: 45, scoringHandicap: 27 });
    await prisma.league.update({ where: { id: fixture.league.id }, data: { handicapHoleLimit: 'par-plus-1' } });
    await SeasonSync.recalculateLeague(fixture.league.id);
    expect(await prisma.round.findUniqueOrThrow({ where: { id: round.id } })).toMatchObject({ gross: 90, adjusted: 45, differential: 9, scoringHandicap: 9 });
    await prisma.league.update({ where: { id: fixture.league.id }, data: { handicapHoleLimit: 'none' } });
    await SeasonSync.recalculateLeague(fixture.league.id);
    expect(await prisma.round.findUniqueOrThrow({ where: { id: round.id } })).toMatchObject({ adjusted: 90, differential: 54 });
  });

  it('carries verified renewal history across hole bases and does not restart establishment', async () => {
    const prior = await createFixture(9);
    for (const [index, extra] of [5, 6, 8, 7, 9].entries()) await addRound(prior, index + 1, extra);
    await SeasonSync.recalculateLeague(prior.league.id);
    const next = await createFixture(18, { id: prior.league.id, email: prior.player.email ?? '' });
    await prisma.player.update({ where: { id: next.player.id }, data: { renewedFromPlayerId: prior.player.id, email: null } });
    const identity = await read(next);
    const history = await loadPreviousHandicapHistory(prisma, prior.league.id, identity, 18);
    expect(history.rounds.map((round) => round.differential)).toEqual([10, 12, 16, 14, 18]);
    await addRound(next, 6, 12, 18);
    await SeasonSync.recalculateLeague(next.league.id);
    expect((await read(next)).handicap).toBe(12.8);
  });

  it('preserves legacy corrections and rejects incomplete scorecards atomically', async () => {
    const fixture = await createFixture(9);
    await addRound(fixture, 1, 5);
    await prisma.player_handicap_adjustment.create({ data: { playerId: fixture.player.id, handicap: 7, effectiveAt: new Date('2026-01-02') } });
    await SeasonSync.recalculateLeague(fixture.league.id);
    expect((await read(fixture)).handicap).toBe(7);
    const second = await addRound(fixture, 3, 6);
    await prisma.score.deleteMany({ where: { roundId: second.id, hole: 9 } });
    await expect(SeasonSync.recalculateLeague(fixture.league.id)).rejects.toThrow('complete');
    expect((await read(fixture)).handicap).toBe(7);
  });

  it('backfills stored handicaps and replays future rounds without rewriting migrated results', async () => {
    const fixture = await createFixture(9);
    const old = await addRound(fixture, 1, 9);
    await SeasonSync.recalculateLeague(fixture.league.id);
    await prisma.event.update({ where: { id: old.eventId }, data: { legacyScoring: true } });
    const snapshot = await prisma.round.findUniqueOrThrow({ where: { id: old.id }, include: { scores: true } });
    await prisma.player.update({ where: { id: fixture.player.id }, data: { handicap: 20 } });
    const preview = await prisma.$transaction((tx) => backfillLeagueHandicaps(tx, fixture.league.id));
    expect(preview).toEqual([{ playerId: fixture.player.id, previous: 20, calculated: 9, eligibleRounds: 1 }]);
    expect((await read(fixture)).handicap).toBe(20);
    await prisma.$transaction((tx) => backfillLeagueHandicaps(tx, fixture.league.id, true));
    expect((await read(fixture)).handicap).toBe(9);
    await addRound(fixture, 2, 7);
    await SeasonSync.recalculateLeague(fixture.league.id);
    expect((await read(fixture)).handicap).toBe(8);
    expect(await prisma.round.findUniqueOrThrow({ where: { id: old.id }, include: { scores: true } })).toEqual(snapshot);
  });

  it('accepts unknown and scratch player creation but rejects malformed values and season-setting changes', async () => {
    const fixture = await createFixture(9);
    await prisma.league_season_entitlement.update({ where: { id: fixture.league.entitlementId }, data: { requiredGolfers: 8, paidGolfers: 8 } });
    const agent = await logIn(fixture);
    const playerUrl = `/api/leagues/${fixture.league.id}/players`;
    const unknown = await agent.post(playerUrl).send({ firstName: 'New', lastName: 'Unknown', gender: 'male' });
    expect(unknown.status, JSON.stringify(unknown.body)).toBe(201);
    expect(unknown.body).toMatchObject({ handicap: null, startingHandicap: null });
    const scratch = await agent.post(playerUrl).send({ firstName: 'New', lastName: 'Scratch', gender: 'female', handicap: 0 });
    expect(scratch.status).toBe(201);
    expect(scratch.body.handicap).toBe(0);
    const edited = await agent.put(`/api/players/${scratch.body.id}`).send({firstName:'Edited',lastName:'Scratch',gender:'female',handicap:''});
    expect(edited.status,JSON.stringify(edited.body)).toBe(200);
    expect((await prisma.player.findUniqueOrThrow({where:{id:scratch.body.id}})).handicap).toBe(0);
    expect((await agent.post(playerUrl).send({ firstName: 'Bad', lastName: 'Value', gender: 'male', handicap: 'bad' })).status).toBe(400);
    const changed = await agent.put(`/api/leagues/${fixture.league.id}`).send({ handicapWindow: 10 });
    expect(changed.status, JSON.stringify(changed.body)).toBe(409);
    expect((await agent.put(`/api/leagues/${fixture.league.id}`).send({ handicapWindow: 21 })).status).toBe(400);
  });

  it('initializes a renewed season from normalized real history at creation', async () => {
    const source = await createFixture(9);
    await addRound(source, 1, 9);
    await SeasonSync.recalculateLeague(source.league.id);
    await prisma.league.update({where:{id:source.league.id},data:{seasonStatus:'archived'}});
    const agent = await logIn(source);
    const response = await agent.post('/api/leagues').send({
      name:'Normalized renewed season',type:'season',format:'individual',holeFormat:'18',
      handicapHoleBasis:18,handicapBestRounds:5,handicapWindow:8,handicapMultiplier:0.96,handicapHoleLimit:'handicap-adjusted',
      renewedFromLeagueId:source.league.id,billingDraftKey:crypto.randomUUID(),startTrial:true,numPlayers:1,
      startDate:'2027-01-01',endDate:'2028-01-01',contactFirstName:'Handicap',contactLastName:'Test',contactEmail:source.league.contactEmail,
      players:[{id:source.player.id,sourcePlayerId:source.player.id,firstName:'Actual',lastName:'Scores',gender:'male',handicap:18}],teams:[],
    });
    expect(response.status,JSON.stringify(response.body)).toBe(201);
    const player = await prisma.player.findFirstOrThrow({where:{leagueId:response.body.id}});
    expect(player.handicap).toBe(17.28);
    expect(await prisma.player_handicap_adjustment.count({where:{playerId:player.id}})).toBe(0);
  });

  it('serializes concurrent score saves and rolls back duplicate submissions', async () => {
    const fixture = await createFixture(9);
    const first = await prepareScoringEvent(fixture, 1);
    const agent = await logIn(fixture);
    const path = `${url(fixture, first.event.id)}/scores`;
    const payload = submission(fixture, first.flight.id, 9);
    const responses = await Promise.all([agent.post(path).send(payload), agent.post(path).send(payload)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.round.count({ where: { eventId: first.event.id } })).toBe(1);
    expect((await read(fixture)).handicap).toBe(9);
  });
});
