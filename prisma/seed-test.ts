import { PrismaClient, type player } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { fortressMaroonHoles, seedMichiganGolfCourses } from './seeds/michigan-courses';
import { seedScoringFormatLab } from './seeds/scoring-format-lab';
import { Round } from '../src/app/services/round';
import { SeasonSync } from '../src/app/services/seasonSync';
import { prisma as scoringDb } from '../src/prisma';

const prisma = new PrismaClient();

async function main() {
  const databaseUrl = new URL(process.env.DATABASE_URL || '');
  if (process.env.NODE_ENV !== 'test' || databaseUrl.pathname !== '/league_night_test' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname) || process.env.RAILWAY_PROJECT_ID) {
    throw new Error('Test fixtures require the isolated local test database.');
  }
  const password = await bcrypt.hash(process.env.DEMO_SEED_PASSWORD || 'integration-test-password', 10);
  const createUser = (email: string, role: 'SUPER' | 'ADMIN' | 'USER') => prisma.user.create({
    data: { email, username: email, firstName: role, lastName: 'Integration', role, password, emailVerifiedAt: new Date() },
  });
  await createUser('super@test.com', 'SUPER');
  const admin = await createUser('admin@test.com', 'ADMIN');
  const member = await createUser('user@test.com', 'USER');
  const { fortressCourse: course, fortressTees: tees } = await seedMichiganGolfCourses(prisma);
  const tee = tees.find((tee) => tee.name === 'Maroon');
  if (!tee) throw new Error('Test course is missing its Maroon tee.');
  const entitlement = await prisma.league_season_entitlement.create({ data: {
    billingOwnerId: admin.id, draftKey: 'integration-league', requiredGolfers: 8, paidGolfers: 8, status: 'consumed',
  } });
  await prisma.stripe_checkout_completion.create({ data: {
    sessionId: 'cs_demo_registration', userId: admin.id, purpose: 'registration', quantity: 8, targetGolfers: 8,
    entitlementId: entitlement.id,
  } });
  const league = await prisma.league.create({ data: {
    name: 'Integration Thursday League', type: 'season', format: 'team', holeFormat: '9', handicapHoleBasis: 9,
    adminId: admin.id, entitlementId: entitlement.id, viewerAccessCode: 'TESTCODE',
    startDate: new Date('2026-01-01'), endDate: new Date('2027-12-31'),
    contactFirstName: 'Integration', contactLastName: 'Admin', contactEmail: admin.email,
  } });
  const players: player[] = [];
  for (let index = 0; index < 8; index += 1) {
    players.push(await prisma.player.create({ data: {
      leagueId: league.id, firstName: `Golfer${index + 1}`, lastName: 'Integration',
      email: `integration-golfer-${index + 1}@test.com`, gender: index % 2 ? 'female' : 'male',
      handicap: 8 + index, startingHandicap: 8 + index, seasonPoints: 0,
      userId: index === 0 ? admin.id : index === 1 ? member.id : null,
    } }));
  }
  const teams = [];
  for (let index = 0; index < 4; index += 1) {
    teams.push(await prisma.team.create({ data: {
      leagueId: league.id, name: `Integration Team ${index + 1}`, seasonPoints: 0,
      players: { connect: players.slice(index * 2, index * 2 + 2).map((player) => ({ id: player.id })) },
    } }));
  }
  const events = [
    { name: 'Week 1 - Team Stroke', format: 'team', scoringMode: 'stroke-play', status: 'completed' },
    { name: 'Week 2 - Team Match', format: 'team', scoringMode: 'match-play', status: 'active' },
    { name: 'Week 3 - Team Match', format: 'team', scoringMode: 'match-play', status: 'upcoming' },
  ];
  for (const [eventIndex, fixture] of events.entries()) {
    const startsAt = new Date('2026-05-07T21:30:00Z');
    startsAt.setUTCDate(startsAt.getUTCDate() + eventIndex * 7);
    const event = await prisma.event.create({ data: {
      ...fixture, leagueId: league.id, courseId: course.id, menTeeId: tee.id,
      holes: 9, startSide: 'front', startsAt, timeZone: 'America/Detroit', interval: 10, type: 'regular',
      scoringConfig: { handicapAllowance: 1 }, pointsEnabled: true, strokePoints: [10, 8, 6, 4],
      ptsPerHole: 1, ptsPerMatch: 2, ptsPerTeamWin: 2, teamPlayersPerEvent: fixture.format === 'team' ? 2 : null,
    } });
    for (let flightIndex = 0; flightIndex < 2; flightIndex += 1) {
      const flightPlayers = players.slice(flightIndex * 4, flightIndex * 4 + 4);
      const flightTeams = teams.slice(flightIndex * 2, flightIndex * 2 + 2);
      await prisma.flight.create({ data: {
        eventId: event.id, startsAt: new Date(startsAt.getTime() + flightIndex * 600_000),
        status: fixture.status === 'completed' ? 'completed' : 'not_started',
        teams: fixture.format === 'team' ? { create: flightTeams.map((team) => ({ teamId: team.id })) } : undefined,
        players: { create: flightPlayers.map((player, index) => ({
          playerId: player.id,
          teamId: fixture.format === 'team' ? flightTeams[Math.floor(index / 2)].id : null,
          opponentId: fixture.scoringMode === 'match-play'
            ? flightPlayers[fixture.format === 'team' ? (index + 2) % 4 : index ^ 1].id : null,
        })) },
      } });
    }
    if (fixture.status === 'completed') {
      for (const [index, player] of players.entries()) {
        const scores = Object.fromEntries(fortressMaroonHoles.slice(0, 9).map((hole, holeIndex) => [hole.num, hole.par + (index + holeIndex) % 3]));
        await new Round(event.id, { playerId: player.id, scores, points: 0, matchPoints: 0 }, undefined, prisma).process();
      }
    }
  }
  await SeasonSync.recalculateLeague(league.id);
  await seedScoringFormatLab({ prisma, adminId: admin.id, courseId: course.id, teeId: tee.id });
  await prisma.event.updateMany({
    where: { name: '[SCORING LAB] Individual Match Play — Ready to Score' },
    data: { status: 'upcoming' },
  });
  console.log('Isolated integration fixtures created.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await scoringDb.$disconnect(); });
