import { applyMaximumScore, type MaximumScoreRule } from './maximum-score';
import {
  calculateStablefordPoints,
  type StablefordPointScale,
} from './stableford';

export type SharedTeamHoleScore = {
  hole: number;
  par: number;
  gross: number;
  net: number;
  pops?: number;
};

export type SharedTeamScoringOptions = {
  maximumScore?: MaximumScoreRule;
  stablefordPointScale?: StablefordPointScale;
};

export const calculateSharedTeamScore = (
  scores: SharedTeamHoleScore[],
  options: SharedTeamScoringOptions = {},
) => {
  const seenHoles = new Set<number>();
  let gross = 0;
  let net = 0;
  let stablefordPoints = 0;
  let cappedHoles = 0;

  for (const score of scores) {
    if (
      !Number.isInteger(score.hole) ||
      score.hole <= 0 ||
      !Number.isFinite(score.par) ||
      score.par <= 0 ||
      !Number.isFinite(score.gross) ||
      score.gross <= 0 ||
      !Number.isFinite(score.net) ||
      score.net < 0 ||
      seenHoles.has(score.hole)
    ) {
      throw new Error('Shared-team scoring requires one valid score per hole.');
    }

    seenHoles.add(score.hole);
    const capped = options.maximumScore
      ? applyMaximumScore({
          gross: score.gross,
          par: score.par,
          pops: score.pops,
          rule: options.maximumScore,
        })
      : { gross: score.gross, net: score.net, wasCapped: false };
    gross += capped.gross;
    net += Math.min(score.net, capped.net);
    if (capped.wasCapped) cappedHoles += 1;
    stablefordPoints += calculateStablefordPoints(
      Math.min(score.net, capped.net),
      score.par,
      options.stablefordPointScale,
    );
  }

  return { holesPlayed: seenHoles.size, gross, net, stablefordPoints, cappedHoles };
};
