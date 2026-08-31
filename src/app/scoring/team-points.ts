import { roundScoringPoints } from './numeric';
import type {
  ScoringFlight,
  ScoringRound,
  TeamEventPointsAccumulator,
} from './types';

export const addTeamEventPoints = (
  accumulator: TeamEventPointsAccumulator,
  leagueId: number,
  eventId: number,
  teamId: number | null | undefined,
  points: number,
) => {
  const numericTeamId = Number(teamId);
  if (!Number.isFinite(numericTeamId) || numericTeamId <= 0) return;

  const key = `${numericTeamId}:${eventId}`;
  const existing = accumulator.get(key);
  accumulator.set(key, {
    leagueId,
    eventId,
    teamId: numericTeamId,
    points: roundScoringPoints((existing?.points || 0) + points),
  });
};

export const getFlightTeamIds = (flight: ScoringFlight): number[] => {
  const explicitTeamIds = (flight.teams || [])
    .map((team) => Number(team.teamId))
    .filter((teamId) => Number.isFinite(teamId) && teamId > 0);

  if (explicitTeamIds.length >= 2) {
    return Array.from(new Set(explicitTeamIds)).slice(0, 2);
  }

  const playerTeamIds = (flight.players || [])
    .map((player) => Number(player.teamId ?? player.player?.teamId))
    .filter((teamId) => Number.isFinite(teamId) && teamId > 0);

  return Array.from(new Set(playerTeamIds)).slice(0, 2);
};

export const getBestNetScoreForHole = (rounds: ScoringRound[], holeNumber: number) => {
  let best: ScoringRound['scores'][number] | null = null;

  for (const round of rounds) {
    const score = round.scores.find((entry) => entry.hole === holeNumber);
    if (!score?.gross) continue;
    if (best == null || score.net < best.net) best = score;
  }

  return best;
};

export const getBestNetForHole = (rounds: ScoringRound[], holeNumber: number) =>
  getBestNetScoreForHole(rounds, holeNumber)?.net ?? null;
