import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import app from '../../app';
import { prisma } from '../../prisma';
import { SeasonSync } from '../services/seasonSync';
import { calculateSharedTeamPoints } from '../scoring';

const password = 'integration-test-password';
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const signIn = async (email = 'admin@test.com') => {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password })).status).toBe(200);
  return agent;
};
const createAccount = async () => prisma.user.create({
  data: {
    firstName: 'Audit', lastName: 'Account', email: `audit-${crypto.randomUUID()}@test.com`,
    password: await bcrypt.hash(password, 10), emailVerifiedAt: new Date(),
  },
});

describe('audit integrity regressions', () => {
  afterAll(() => prisma.$disconnect());

  it('keeps the original email until the replacement is verified and revokes other sessions', async () => {
    const user = await createAccount();
    const first = await signIn(user.email);
    const second = await signIn(user.email);
    const email = `changed-${crypto.randomUUID()}@test.com`;
    expect((await first.put(`/api/users/${user.id}`).send({ email })).status).toBe(403);
    const changed = await first.put(`/api/users/${user.id}`).send({ email, currentPassword: password });
    expect(changed.status).toBe(200);
    expect(changed.body.email).toBe(user.email);
    const pending = await prisma.email_verification_token.findFirstOrThrow({
      where: { userId: user.id, pendingEmail: email, usedAt: null },
    });
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.email_verification_token.update({ where: { id: pending.id }, data: { tokenHash: hash(token) } });
    const verified = await first.post('/api/auth/email-verification/verify').send({ token });
    expect(verified.status).toBe(200);
    expect(verified.body.user.email).toBe(email);
    expect((await second.get('/api/auth/me')).status).toBe(401);
    expect((await first.post('/api/auth/email-verification/verify').send({ token })).status).toBe(400);
  });

  it('requires the current password and revokes other sessions on password changes', async () => {
    const user = await createAccount();
    const first = await signIn(user.email);
    const second = await signIn(user.email);
    expect((await first.put(`/api/users/${user.id}`).send({ password: 'replacement-password' })).status).toBe(403);
    expect((await first.put(`/api/users/${user.id}`).send({
      password: 'replacement-password', currentPassword: password,
    })).status).toBe(200);
    expect((await first.get('/api/auth/me')).status).toBe(200);
    expect((await second.get('/api/auth/me')).status).toBe(401);
  });

  it('allows exactly one concurrent redemption of a password-reset token', async () => {
    const user = await createAccount();
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.password_reset_token.create({
      data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 60_000) },
    });
    const results = await Promise.all(['first-password', 'second-password'].map((password) =>
      request(app).post('/api/auth/password-reset/complete').send({ token, password }),
    ));
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
  });

  it('preserves an administrator handicap correction through repeated season replay and previews', async () => {
    const admin = await signIn();
    const league = await prisma.league.findFirstOrThrow({ where: { name: 'Seeded Thursday Night League' } });
    const player = await prisma.player.create({
      data: { leagueId: league.id, firstName: 'Audit', lastName: 'Handicap', type: 'substitute', gender: 'male', handicap: 12, startingHandicap: 12, seasonPoints: 0 },
    });
    try {
      const edited = await admin.put(`/api/players/${player.id}`).send({
        firstName: player.firstName, lastName: player.lastName, type: player.type, gender: player.gender, handicap: 7,
      });
      expect(edited.status).toBe(200);
      await SeasonSync.recalculateLeague(league.id);
      await SeasonSync.recalculateLeague(league.id);
      expect((await prisma.player.findUniqueOrThrow({ where: { id: player.id } })).handicap).toBe(7);
      expect(await prisma.player_handicap_adjustment.count({ where: { playerId: player.id } })).toBe(1);
    } finally {
      await prisma.player_handicap_adjustment.deleteMany({ where: { playerId: player.id } });
      await prisma.player.delete({ where: { id: player.id } });
    }
  });

  it('serializes team saves across flights and can review and restore a recorded score revision', async () => {
    const admin = await signIn();
    const event = await prisma.event.findFirstOrThrow({
      where: { name: '[SCORING LAB] Team Scramble — Completed Results' },
      include: { flights: { orderBy: { id: 'asc' }, include: { teams: true } } },
    });
    const payloads = event.flights.map((flight, index) => ({
      flightId: flight.id,
      teamScores: flight.teams.map((team) => ({
        teamId: team.teamId,
        scores: Object.fromEntries(Array.from({ length: event.holes }, (_, hole) => [hole + 1, index + 4])),
      })),
    }));
    const base = `/api/leagues/${event.leagueId}/events/${event.id}`;
    const saved = await Promise.all(payloads.map((data) => admin.put(`${base}/scores`).send(data)));
    expect(saved.map((result) => result.status)).toEqual(payloads.map(() => 200));
    const rounds = await prisma.team_round.findMany({
      where: { eventId: event.id, deletedAt: null }, include: { scores: true },
    });
    const expected = calculateSharedTeamPoints(rounds.map((round) => ({
      teamId: round.teamId, net: round.net, stablefordPoints: round.scores.reduce((sum, score) => sum + score.points, 0),
    })), event.strokePoints);
    expect(rounds.map((round) => ({ teamId: round.teamId, points: round.pointsEarned }))).toEqual(expected);
    for (const data of payloads) {
      for (const team of data.teamScores) {
        expect(rounds.find((round) => round.teamId === team.teamId)?.gross).toBe(Object.values(team.scores).reduce((sum, score) => sum + score, 0));
      }
    }
    const history = await admin.get(`${base}/score-history`);
    expect(history.status).toBe(200);
    const revisionId: number = history.body[0].id;
    const originalGross: number = history.body[0].metadata.after.teamScores[0].scores['1'];
    const originalTeam: number = history.body[0].metadata.after.teamScores[0].teamId;
    const snapshot = history.body[0].metadata.after;
    const edit = { ...snapshot, teamScores: snapshot.teamScores.map((team: { teamId: number; scores: Record<string, number> }) => ({
      ...team, scores: { ...team.scores, '1': 9 },
    })) };
    expect((await admin.put(`${base}/scores`).send(edit)).status).toBe(200);
    expect((await admin.post(`${base}/score-history/${revisionId}/restore`)).status).toBe(200);
    const score = await prisma.team_score.findFirstOrThrow({
      where: { hole: 1, teamRound: { eventId: event.id, teamId: originalTeam } },
    });
    expect(score.gross).toBe(originalGross);
    const member = await signIn('user@test.com');
    expect((await member.post(`${base}/score-history/${revisionId}/restore`)).status).toBe(403);
    const profile = await admin.get(`/api/teams/${originalTeam}`);
    const result = profile.body.eventResults.find((entry: { id: number }) => entry.id === event.id);
    expect(result.sharedRound.scores).toHaveLength(event.holes);
    expect(result.opponents).toEqual([]);
    expect(result.fieldRank).toBeGreaterThan(0);
  });
  it('serializes cancellation against score entry', async () => {
    const admin = await signIn();
    const source = await prisma.event.findFirstOrThrow({
      where: { name: '[SCORING LAB] Team Scramble — Completed Results' },
      include: { flights: { include: { players: true, teams: true }, take: 1 } },
    });
    const event = await prisma.event.create({
      data: {
        leagueId: source.leagueId, courseId: source.courseId, teeId: source.teeId,
        name: 'Audit cancellation race', format: source.format, scoringMode: source.scoringMode,
        type: source.type, holes: source.holes, startSide: source.startSide,
        startsAt: new Date(), timeZone: source.timeZone, interval: source.interval, status: 'active',
        flights: { create: {
          startsAt: new Date(),
          players: { create: source.flights[0].players.map((player) => ({
            playerId: player.playerId, teamId: player.teamId, opponentId: player.opponentId,
          })) },
          teams: { create: source.flights[0].teams.map((team) => ({ teamId: team.teamId, opponentId: team.opponentId })) },
        } },
      },
      include: { flights: { include: { teams: true } } },
    });
    const base = `/api/leagues/${event.leagueId}/events/${event.id}`;
    const [save, cancel] = await Promise.all([
      admin.post(`${base}/scores`).send({
        flightId: event.flights[0].id,
        teamScores: event.flights[0].teams.map((team) => ({
          teamId: team.teamId, scores: Object.fromEntries(Array.from({ length: event.holes }, (_, index) => [index + 1, 4])),
        })),
      }),
      admin.patch(`${base}/cancel`),
    ]);
    expect([[201, 409], [409, 200]]).toContainEqual([save.status, cancel.status]);
    const final = await prisma.event.findUniqueOrThrow({
      where: { id: event.id }, include: { teamRounds: true },
    });
    expect(final.status === 'canceled' ? final.teamRounds.length === 0 : final.teamRounds.length === event.flights[0].teams.length).toBe(true);
  });

  it('blocks active assignments but permits removal after the event becomes historical', async () => {
    const admin = await signIn();
    const event = await prisma.event.findFirstOrThrow({ where: { name: 'Audit cancellation race' } });
    const team = await prisma.team.create({ data: { name: 'Audit retiring team', leagueId: event.leagueId, seasonPoints: 0 } });
    const player = await prisma.player.create({
      data: { firstName: 'Audit', lastName: 'Retiring', leagueId: event.leagueId, teamId: team.id, handicap: 10, startingHandicap: 10, seasonPoints: 0, type: 'substitute' },
    });
    const flight = await prisma.flight.create({
      data: { eventId: event.id, startsAt: new Date(), teams: { create: { teamId: team.id } }, players: { create: { playerId: player.id, teamId: team.id } } },
    });
    await prisma.event.update({ where: { id: event.id }, data: { status: 'active' } });
    expect((await admin.delete(`/api/players/${player.id}`)).status).toBe(409);
    expect((await admin.delete(`/api/teams/${team.id}`)).status).toBe(409);
    await prisma.event.update({ where: { id: event.id }, data: { status: 'completed' } });
    expect((await admin.delete(`/api/players/${player.id}`)).status).toBe(200);
    expect((await admin.delete(`/api/teams/${team.id}`)).status).toBe(200);
    expect(await prisma.flight_player.count({ where: { flightId: flight.id } })).toBe(1);
    expect(await prisma.flight_team.count({ where: { flightId: flight.id } })).toBe(1);
  });

});
