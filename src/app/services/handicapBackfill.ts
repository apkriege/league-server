import type { Prisma } from '@prisma/client';
import { normalizeHandicapSettings } from '../utils/handicap-settings';
import { calculateLeagueHandicap } from '../utils/league-handicap';
import { loadPreviousHandicapHistory, toHandicapSourceRound } from './playerHandicapHistory';

export async function backfillLeagueHandicaps(db: Prisma.TransactionClient, leagueId: number, apply = false) {
  const league = await db.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: { players: { where: { deletedAt: null }, include: {
      handicapAdjustments: { orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }] },
      rounds: { where: { deletedAt: null, status: 'completed', event: { deletedAt: null, status: { not: 'canceled' } } },
        include: { event: { select: { id: true, name: true, startsAt: true } }, scores: true } },
    } } },
  });
  const settings = normalizeHandicapSettings(league);
  const changes: Array<{ playerId: number; previous: number | null; calculated: number | null; eligibleRounds: number }> = [];
  for (const player of league.players) {
    const history = await loadPreviousHandicapHistory(db, league.renewedFromLeagueId, player, settings.handicapHoleBasis);
    const calculation = calculateLeagueHandicap(
      [...history.rounds, ...player.rounds.flatMap((round) => toHandicapSourceRound(round, settings.handicapHoleBasis))],
      history.startingHandicap ?? player.startingHandicap, settings.handicapHoleBasis,
      [...history.adjustments, ...player.handicapAdjustments.map((adjustment) => ({ handicap: adjustment.handicap, effectiveAt: adjustment.effectiveAt.toISOString() }))], settings,
    );
    if (player.handicap === calculation.index) continue;
    changes.push({ playerId: player.id, previous: player.handicap, calculated: calculation.index, eligibleRounds: calculation.eligibleRounds });
    if (apply) await db.player.update({ where: { id: player.id }, data: { handicap: calculation.index } });
  }
  return changes;
}
