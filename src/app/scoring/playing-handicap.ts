import { calculateStrokePops } from '../utils/tee-rating';
import { applyHandicapAllowance } from './team-handicap';
import type { ScoringHole, ScoringRound } from './types';

export const getRoundHoles = (round: ScoringRound, fallback: ScoringHole[]) =>
  Array.isArray(round.holes) && round.holes.length > 0 ? round.holes : fallback;

export const buildPlayingHandicaps = (
  rounds: ScoringRound[],
  allowance: number,
) => {
  if (rounds.length === 0) return new Map<number, number>();
  return new Map(
    rounds.map((round) => [
      round.playerId,
      applyHandicapAllowance(round.playerHandicap, allowance),
    ]),
  );
};

const applyCompetitionValues = (
  rounds: ScoringRound[],
  playingHandicaps: Map<number, number>,
  popsByPlayerId: Map<number, Map<number, number>>,
) => {
  for (const round of rounds) {
    const pops = popsByPlayerId.get(round.playerId) ?? new Map<number, number>();
    round.playingHandicap = Number(playingHandicaps.get(round.playerId) ?? 0);
    round.competitionPops = pops;
    round.competitionNet = round.scores.reduce(
      (total, score) => total + score.gross - (pops.get(score.hole) || 0),
      0,
    );
  }
};

export const buildAbsolutePops = (
  rounds: ScoringRound[],
  fallbackHoles: ScoringHole[],
  allowance: number,
) => {
  const playingHandicaps = buildPlayingHandicaps(rounds, allowance);
  const popsByPlayerId = new Map(
    rounds.map((round) => [
      round.playerId,
      calculateStrokePops(
        Number(playingHandicaps.get(round.playerId)),
        getRoundHoles(round, fallbackHoles),
      ),
    ]),
  );
  applyCompetitionValues(rounds, playingHandicaps, popsByPlayerId);
  return popsByPlayerId;
};

export const buildRelativePops = (
  rounds: ScoringRound[],
  fallbackHoles: ScoringHole[],
  allowance: number,
) => {
  const playingHandicaps = buildPlayingHandicaps(rounds, allowance);
  if (playingHandicaps.size === 0) return new Map<number, Map<number, number>>();
  const baseline = Math.min(...playingHandicaps.values());
  const relativePlayingHandicaps = new Map(
    [...playingHandicaps].map(([playerId, handicap]) => [playerId, handicap - baseline]),
  );
  const popsByPlayerId = new Map(
    rounds.map((round) => [
      round.playerId,
      calculateStrokePops(
        Number(relativePlayingHandicaps.get(round.playerId)),
        getRoundHoles(round, fallbackHoles),
      ),
    ]),
  );
  applyCompetitionValues(rounds, relativePlayingHandicaps, popsByPlayerId);
  return popsByPlayerId;
};

export const getCompetitionHoleNet = (
  round: ScoringRound,
  holeNumber: number,
  popsByPlayerId: Map<number, Map<number, number>>,
) => {
  const score = round.scores.find((entry) => entry.hole === holeNumber);
  if (!score) return null;
  return score.gross - (popsByPlayerId.get(round.playerId)?.get(holeNumber) || 0);
};

export const getCompetitionNetTotal = (
  round: ScoringRound,
  popsByPlayerId: Map<number, Map<number, number>>,
) => round.scores.reduce(
  (total, score) =>
    total + score.gross - (popsByPlayerId.get(round.playerId)?.get(score.hole) || 0),
  0,
);
