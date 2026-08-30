import {
  calculateSharedTeamScore,
  type SharedTeamHoleScore,
  type SharedTeamScoringOptions,
} from './shared-team-score';

export type AlternateShotHoleScore = SharedTeamHoleScore;

export const calculateAlternateShotTeamScore = (
  scores: AlternateShotHoleScore[],
  options?: SharedTeamScoringOptions,
) => calculateSharedTeamScore(scores, options);
