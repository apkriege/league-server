import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import { usersSeed } from './seeds/users';
import { clubSeed, courseSeed, teeSeed } from './seeds/courses';
import dbSnapshot from './seeds/db-snapshot.json';

async function main() {
  try {
    const hasSnapshot = Array.isArray((dbSnapshot as any)?.user);

    if (hasSnapshot) {
      const snap: any = dbSnapshot as any;

      if ((snap.session || []).length) {
        await prisma.session.createMany({ data: snap.session, skipDuplicates: true });
      }
      if ((snap.user || []).length) {
        await prisma.user.createMany({ data: snap.user, skipDuplicates: true });
      }
      if ((snap.club || []).length) {
        await prisma.club.createMany({ data: snap.club, skipDuplicates: true });
      }
      if ((snap.course || []).length) {
        await prisma.course.createMany({ data: snap.course, skipDuplicates: true });
      }
      if ((snap.tee || []).length) {
        await prisma.tee.createMany({ data: snap.tee, skipDuplicates: true });
      }
      if ((snap.league || []).length) {
        await prisma.league.createMany({ data: snap.league, skipDuplicates: true });
      }
      if ((snap.event || []).length) {
        await prisma.event.createMany({ data: snap.event, skipDuplicates: true });
      }
      if ((snap.team || []).length) {
        await prisma.team.createMany({ data: snap.team, skipDuplicates: true });
      }
      if ((snap.player || []).length) {
        await prisma.player.createMany({ data: snap.player, skipDuplicates: true });
      }
      if ((snap.flight || []).length) {
        await prisma.flight.createMany({ data: snap.flight, skipDuplicates: true });
      }
      if ((snap.flight_team || []).length) {
        await prisma.flight_team.createMany({ data: snap.flight_team, skipDuplicates: true });
      }
      if ((snap.flight_player || []).length) {
        await prisma.flight_player.createMany({ data: snap.flight_player, skipDuplicates: true });
      }
      if ((snap.round || []).length) {
        await prisma.round.createMany({ data: snap.round, skipDuplicates: true });
      }
      if ((snap.score || []).length) {
        await prisma.score.createMany({ data: snap.score, skipDuplicates: true });
      }
      if ((snap.team_event_points || []).length) {
        await prisma.team_event_points.createMany({
          data: snap.team_event_points,
          skipDuplicates: true,
        });
      }

      // Reset all sequences so autoincrement IDs don't collide with seeded data
      const tables = [
        'user',
        'club',
        'course',
        'tee',
        'league',
        'event',
        'team',
        'player',
        'flight',
        'flight_team',
        'flight_player',
        'round',
        'score',
        'team_event_points',
      ];
      for (const table of tables) {
        await prisma.$executeRawUnsafe(
          `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM "${table}"), 1))`,
        );
      }

      return;
    }

    // Fallback legacy seed path
    await prisma.user.createMany({ data: usersSeed });
    await prisma.club.createMany({ data: clubSeed });
    await prisma.course.createMany({ data: courseSeed });
    await prisma.tee.createMany({ data: teeSeed });
  } catch (error) {
    console.error(error);
  }
}

main()
  .then(() => {
    console.log('Seeding complete.');
  })
  .catch((e) => {
    console.error('Seeding failed:', e);
  });
