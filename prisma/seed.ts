import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { fortressMaroonHoles, seedMichiganGolfCourses } from './seeds/michigan-courses';
import { Round } from '../src/app/services/round';
import { SeasonSync } from '../src/app/services/seasonSync';
import { prisma as scoringDb } from '../src/prisma';

const prisma = new PrismaClient();
const password = process.env.DEMO_SEED_PASSWORD || 'testing1';
const timeZone = 'America/Detroit';
const today = new Date();
today.setUTCHours(21, 30, 0, 0);
const date = (days: number) => new Date(today.getTime() + days * 86_400_000);
const names = [
  ['Adam', 'Admin'], ['Morgan', 'Reed'], ['Ben', 'Baker'], ['Chris', 'Carter'],
  ['Drew', 'Dalton'], ['Evan', 'Edwards'], ['Frank', 'Foster'], ['Grant', 'Gibson'],
  ['Jo', 'Parker'], ['Sam', 'Taylor'],
] as const;

async function main() {
  const databaseUrl = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname) ||
      process.env.NODE_ENV === 'production' || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT) {
    throw new Error('Demo seeds may only rebuild a local development database.');
  }
  if (password.length < 8) throw new Error('DEMO_SEED_PASSWORD must be at least 8 characters.');
  const hashedPassword = await bcrypt.hash(password, 10);
  const tables = Prisma.dmmf.datamodel.models.map(model => `"${model.dbName || model.name}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);

  const createUser = (email: string, role: 'SUPER' | 'ADMIN' | 'USER', firstName: string) =>
    prisma.user.create({ data: { email, username: email, role, firstName, lastName: 'Demo', password: hashedPassword } });
  await createUser('super@test.com', 'SUPER', 'Super');
  const admin = await createUser('admin@test.com', 'ADMIN', 'Adam');
  const member = await createUser('user@test.com', 'USER', 'Morgan');
  const { fortressCourse: course, fortressTees: tees } = await seedMichiganGolfCourses(prisma);
  const tee = tees.find(item => item.name === 'Maroon');
  if (!tee) throw new Error('The Fortress Maroon tee is required.');

  const scenarios = [
    { key: 'new', name: 'New League · Start Here', trial: true, roster: 0, archived: false },
    { key: 'trial', name: 'Trial League · One Event Used', trial: true, roster: 4, archived: false },
    { key: 'paid', name: 'Thursday League · Paid Capacity', trial: false, roster: 10, archived: false },
    { key: 'archive', name: 'Previous Season · Results', trial: false, roster: 8, archived: true },
  ] as const;

  for (const [scenarioIndex, scenario] of scenarios.entries()) {
    const entitlement = await prisma.league_season_entitlement.create({ data: {
      billingOwnerId: admin.id, draftKey: `demo-${scenario.key}`, requiredGolfers: 8,
      paidGolfers: scenario.trial ? 0 : 8, status: scenario.trial ? 'trialing' : 'consumed',
      trialEventLimit: scenario.trial ? 3 : 0,
    } });
    const league = await prisma.league.create({ data: {
      name: scenario.name, description: 'Local demo fixture for the current league workflow.',
      type: 'season', format: 'individual', holeFormat: '9', handicapHoleBasis: 9, adminId: admin.id,
      entitlementId: entitlement.id, viewerAccessCode: `DEMO${scenarioIndex + 1}`,
      startDate: date(scenario.archived ? -120 : -21), endDate: date(scenario.archived ? -30 : 90),
      contactFirstName: 'Adam', contactLastName: 'Admin', contactEmail: admin.email,
    } });
    const players = [];
    for (let index = 0; index < scenario.roster; index += 1) {
      const [firstName, lastName] = names[index];
      players.push(await prisma.player.create({ data: {
        firstName, lastName, leagueId: league.id, type: index >= 8 ? 'substitute' : 'player',
        gender: index % 3 === 1 ? 'female' : 'male', handicap: 4 + index, startingHandicap: 4 + index,
        seasonPoints: 0, userId: index === 0 ? admin.id : index === 1 ? member.id : null,
      } }));
    }
    if (scenario.roster === 0) {
      console.log(`${league.name}: no players or events; trial remaining 3`);
      continue;
    }
    const regularPlayers = players.filter(player => player.type === 'player');
    const eventStates = scenario.archived ? ['completed', 'completed'] : ['completed', 'active', 'upcoming'];
    for (const [eventIndex, status] of eventStates.entries()) {
      const startsAt = date(scenario.archived ? -100 + eventIndex * 7 : -7 + eventIndex * 7);
      const event = await prisma.event.create({ data: {
        leagueId: league.id, courseId: course.id, teeId: tee.id, name: `Week ${eventIndex + 1}`,
        type: 'regular', format: 'individual', holes: 9, startSide: 'front', startsAt, timeZone,
        interval: 10, scoringMode: 'stroke-play', scoringConfig: { handicapAllowance: 1 },
        pointsEnabled: true, strokePoints: [10, 8, 6, 4, 2, 1], status,
      } });
      for (let offset = 0; offset < regularPlayers.length; offset += 4) {
        const flight = await prisma.flight.create({ data: {
          eventId: event.id, startsAt: new Date(startsAt.getTime() + offset / 4 * 10 * 60_000),
          status: status === 'completed' ? 'completed' : 'not_started',
        } });
        await prisma.flight_player.createMany({ data: regularPlayers.slice(offset, offset + 4)
          .map(player => ({ flightId: flight.id, playerId: player.id })) });
      }
      if (status === 'completed') {
        for (const [playerIndex, player] of regularPlayers.entries()) {
          const scores = Object.fromEntries(fortressMaroonHoles.slice(0, 9).map((hole, holeIndex) =>
            [hole.num, Math.max(1, hole.par + (playerIndex + holeIndex + eventIndex) % 3)]));
          await new Round(event.id, { playerId: player.id, scores, points: 0, matchPoints: 0 }, undefined, prisma).process();
        }
        if (scenario.trial) {
          await prisma.trial_scored_event.create({ data: { entitlementId: entitlement.id, eventId: event.id } });
          await prisma.league_season_entitlement.update({ where: { id: entitlement.id }, data: { trialEventCount: { increment: 1 } } });
        }
      }
    }
    await SeasonSync.recalculateLeague(league.id);
    if (scenario.archived) await prisma.league.update({ where: { id: league.id }, data: { seasonStatus: 'archived' } });
    console.log(`${league.name}: ${regularPlayers.length} players, ${players.length - regularPlayers.length} subs`);
  }
  console.log('Local seed complete. Accounts: admin@test.com, user@test.com, super@test.com.');
  console.log('Password: DEMO_SEED_PASSWORD, or testing1 when unset.');
}

main().catch(error => { console.error('Seeding failed:', error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await scoringDb.$disconnect(); });
