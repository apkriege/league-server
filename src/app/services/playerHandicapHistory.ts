import { Prisma } from '@prisma/client';
import type { HandicapAdjustment, HandicapRound } from '../utils/league-handicap';
import { calculateRoundDifferential } from '../utils/tee-rating';

type HistoryDb = Pick<Prisma.TransactionClient, 'league' | 'player'>;
type PlayerIdentity = { userId: number | null; email: string | null; renewedFromPlayerId?: number | null };
export type HandicapSourceRound = HandicapRound & {
  eventName: string;
  gross: number;
  net: number | null;
  adjustedGross: number;
  rating: number;
  slope: number;
};
export type PlayerHandicapHistory = {
  startingHandicap: number | null;
  rounds: HandicapSourceRound[];
  adjustments: HandicapAdjustment[];
};

export function toHandicapSourceRound(round: {
  id: number; holesPlayed: number; gross?: number; net?: number; adjusted: number; courseRating: number; courseSlope: number;
  event: { id: number; startsAt: Date; name: string }; scores: Array<{ gross: number; hole: number }>;
}, basis: 9 | 18): HandicapSourceRound[] {
  if ((round.holesPlayed !== 9 && round.holesPlayed !== 18) || round.scores.length !== round.holesPlayed ||
    new Set(round.scores.map((score) => score.hole)).size !== round.holesPlayed ||
    round.scores.some((score) => !Number.isInteger(score.gross) || score.gross <= 0) ||
    !Number.isFinite(round.adjusted) || round.adjusted <= 0 || round.scores.some((score) => !Number.isInteger(score.hole) || score.hole <= 0) || !Number.isFinite(round.courseRating) || round.courseRating <= 0 || !Number.isFinite(round.courseSlope) || round.courseSlope <= 0) return [];
  const differential = calculateRoundDifferential(round.adjusted, { rating: round.courseRating, slope: round.courseSlope, holesPlayed: round.holesPlayed }, 0, basis);
  return [{ id: round.id, eventId: round.event.id, differential,
    holes: round.holesPlayed, playedAt: round.event.startsAt.toISOString(), eventName: round.event.name,
    gross: round.gross ?? round.scores.reduce((total, score) => total + score.gross, 0), net: round.net ?? null,
    adjustedGross: round.adjusted, rating: round.courseRating, slope: round.courseSlope }];
}

export async function loadPreviousHandicapHistory(
  db: HistoryDb,
  previousLeagueId: number | null,
  identity: PlayerIdentity,
  basis: 9 | 18,
  visited = new Set<number>(),
): Promise<PlayerHandicapHistory> {
  const empty: PlayerHandicapHistory = { startingHandicap: null, rounds: [], adjustments: [] };
  if (!previousLeagueId || (!identity.renewedFromPlayerId && !identity.userId && !identity.email)) return empty;
  if (visited.has(previousLeagueId)) throw new Error('Invalid league renewal history.');
  visited.add(previousLeagueId);
  const league = await db.league.findFirst({
    where: { id: previousLeagueId, deletedAt: null },
    select: { handicapHoleBasis: true, renewedFromLeagueId: true },
  });
  if (!league) return empty;
  const candidates = await db.player.findMany({
    where: {
      leagueId: previousLeagueId, deletedAt: null,
      ...(identity.renewedFromPlayerId ? { id: identity.renewedFromPlayerId } : identity.userId ? { userId: identity.userId } : { email: { equals: identity.email ?? '', mode: 'insensitive' } }),
    },
    include: {
      handicapAdjustments: { orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }] },
      rounds: {
        where: { deletedAt: null, status: 'completed', event: { deletedAt: null, status: { not: 'canceled' } } },
        include: { event: { select: { id: true, name: true, startsAt: true } }, scores: true },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (candidates.length !== 1) return empty;
  const player = candidates[0];
  const previous = await loadPreviousHandicapHistory(db, league.renewedFromLeagueId, player, basis, visited);
  return {
    startingHandicap: previous.startingHandicap ?? (player.startingHandicap == null ? null : player.startingHandicap * basis / league.handicapHoleBasis),
    rounds: [...previous.rounds, ...player.rounds.flatMap((round) => toHandicapSourceRound(round, basis))],
    adjustments: [...previous.adjustments, ...player.handicapAdjustments.map((adjustment) => ({ handicap: adjustment.handicap * basis / league.handicapHoleBasis, effectiveAt: adjustment.effectiveAt.toISOString() }))],
  };
}
