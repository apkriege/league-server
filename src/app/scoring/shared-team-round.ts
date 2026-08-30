import { calculateStrokePops, type TeeHole } from '../utils/tee-rating';
import { applyMaximumScore } from './maximum-score';
import type { ScoringConfiguration } from './config';
import type { ScoringMode } from './modes';
import { calculateStablefordPoints } from './stableford';

export type SharedTeamRoundMode = Extract<ScoringMode, 'scramble' | 'alternate-shot'>;

export type SharedTeamRoundHole = {
  hole: number;
  par: number;
  gross: number;
  net: number;
  adjusted: number;
  popsReceived: number;
  points: number;
};

export type ModeledSharedTeamRound = {
  holesPlayed: number;
  gross: number;
  net: number;
  adjusted: number;
  stablefordPoints: number;
  scores: SharedTeamRoundHole[];
};

export const normalizeSharedTeamGrossScores = (
  raw: unknown,
  holes: TeeHole[],
): Map<number, number> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Team scores must include one stroke total for every hole.');
  }

  const expectedHoles = new Set(holes.map((hole) => hole.num));
  const entries = Object.entries(raw as Record<string, unknown>);
  const scores = new Map<number, number>();

  for (const [rawHole, rawGross] of entries) {
    const hole = Number(rawHole);
    const gross = Number(rawGross);
    if (
      !Number.isInteger(hole) ||
      !expectedHoles.has(hole) ||
      !Number.isInteger(gross) ||
      gross < 1 ||
      gross > 30 ||
      scores.has(hole)
    ) {
      throw new Error('Team scores must contain one valid stroke total for every hole.');
    }
    scores.set(hole, gross);
  }

  if (scores.size !== expectedHoles.size) {
    throw new Error('Team scores must contain one valid stroke total for every hole.');
  }
  return scores;
};

export const modelSharedTeamRound = ({
  holes,
  rawScores,
  courseHandicap,
  configuration,
}: {
  mode: SharedTeamRoundMode;
  holes: TeeHole[];
  rawScores: unknown;
  courseHandicap: number;
  configuration: ScoringConfiguration;
}): ModeledSharedTeamRound => {
  const grossScores = normalizeSharedTeamGrossScores(rawScores, holes);
  const pops = calculateStrokePops(courseHandicap, holes);
  const scores = holes.map((hole) => {
    const submittedGross = grossScores.get(hole.num);
    if (submittedGross == null) throw new Error(`Missing score for hole ${hole.num}.`);
    const holePops = pops.get(hole.num) || 0;
    const capped = configuration.maximumScore
      ? applyMaximumScore({
          gross: submittedGross,
          par: hole.par,
          pops: holePops,
          rule: configuration.maximumScore,
        })
      : {
          gross: submittedGross,
          net: Math.max(0, submittedGross - holePops),
        };
    const net = Math.max(0, capped.net);

    return {
      hole: hole.num,
      par: hole.par,
      gross: submittedGross,
      net,
      adjusted: capped.gross,
      popsReceived: holePops,
      points: calculateStablefordPoints(net, hole.par, configuration.stablefordPointScale),
    };
  });

  return scores.reduce<ModeledSharedTeamRound>(
    (round, score) => ({
      holesPlayed: round.holesPlayed + 1,
      gross: round.gross + score.gross,
      net: round.net + score.net,
      adjusted: round.adjusted + score.adjusted,
      stablefordPoints: round.stablefordPoints + score.points,
      scores: [...round.scores, score],
    }),
    { holesPlayed: 0, gross: 0, net: 0, adjusted: 0, stablefordPoints: 0, scores: [] },
  );
};
