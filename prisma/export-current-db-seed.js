const { writeFileSync } = require('fs');
const { resolve } = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const snapshot = {
    session: await prisma.session.findMany({ orderBy: { sid: 'asc' } }),
    user: await prisma.user.findMany({ orderBy: { id: 'asc' } }),
    club: await prisma.club.findMany({ orderBy: { id: 'asc' } }),
    course: await prisma.course.findMany({ orderBy: { id: 'asc' } }),
    tee: await prisma.tee.findMany({ orderBy: { id: 'asc' } }),
    league: await prisma.league.findMany({ orderBy: { id: 'asc' } }),
    event: await prisma.event.findMany({ orderBy: { id: 'asc' } }),
    team: await prisma.team.findMany({ orderBy: { id: 'asc' } }),
    player: await prisma.player.findMany({ orderBy: { id: 'asc' } }),
    flight: await prisma.flight.findMany({ orderBy: { id: 'asc' } }),
    flight_team: await prisma.flight_team.findMany({ orderBy: { id: 'asc' } }),
    flight_player: await prisma.flight_player.findMany({ orderBy: { id: 'asc' } }),
    round: await prisma.round.findMany({ orderBy: { id: 'asc' } }),
    score: await prisma.score.findMany({ orderBy: { id: 'asc' } }),
    team_event_points: await prisma.team_event_points.findMany({ orderBy: { id: 'asc' } }),
  };

  const outputPath = resolve(__dirname, 'seeds', 'db-snapshot.json');
  writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  console.log(`Wrote snapshot seed to ${outputPath}`);
}

main()
  .catch((error) => {
    console.error('Failed to export DB snapshot seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
