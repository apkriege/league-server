import { prisma } from '../prisma';
import { backfillLeagueHandicaps } from '../app/services/handicapBackfill';

async function main() {
  const apply = process.argv.includes('--apply');
  const leagues = await prisma.league.findMany({ where: { deletedAt: null, seasonStatus: 'active' }, select: { id: true } });
  for (const league of leagues) {
    const changes = await prisma.$transaction((tx) => backfillLeagueHandicaps(tx, league.id, apply), { timeout: 60000 });
    process.stdout.write(`${JSON.stringify({ leagueId: league.id, apply, changes })}\n`);
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
