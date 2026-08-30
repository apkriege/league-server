import {
  calculateSharedTeamScore,
  type SharedTeamHoleScore,
  type SharedTeamScoringOptions,
} from './shared-team-score';

export type ScrambleHoleScore = SharedTeamHoleScore;

export const calculateScrambleTeamScore = (
  scores: ScrambleHoleScore[],
  options?: SharedTeamScoringOptions,
) => calculateSharedTeamScore(scores, options);
