import { normalizeScoringConfiguration } from './config';
import { applyMaximumScore } from './maximum-score';
import { parsePlacementPoints, roundScoringPoints } from './numeric';
import { calculateStablefordPoints } from './stableford';
import type { ScoringEvent, ScoringRound } from './types';

export const assignStablefordPoints = (event: ScoringEvent, rounds: ScoringRound[]) => {
  const configuration = normalizeScoringConfiguration(event.scoringConfig, 'stableford');
  for (const round of rounds) {
    round.pointsEarned = roundScoringPoints(
      round.scores.reduce(
        (total, score) =>
          total +
          calculateStablefordPoints(score.net, score.par, configuration.stablefordPointScale),
        0,
      ),
    );
    round.matchPoints = 0;
  }
};

export const getMaximumScoreCompetitionTotal = (
  event: ScoringEvent,
  round: ScoringRound,
) => {
  const configuration = normalizeScoringConfiguration(event.scoringConfig, 'maximum-score');
  if (!configuration.maximumScore) throw new Error('A maximum-score rule is required.');
  return round.scores.reduce(
    (total, score) => {
      const capped = applyMaximumScore({
        gross: score.gross,
        par: score.par,
        pops: score.pops,
        rule: configuration.maximumScore!,
      });
      return { gross: total.gross + capped.gross, net: total.net + capped.net };
    },
    { gross: 0, net: 0 },
  );
};

export const getMaximumScoreStablefordPoints = (
  event: ScoringEvent,
  round: ScoringRound,
) => {
  const configuration = normalizeScoringConfiguration(event.scoringConfig, 'maximum-score');
  if (!configuration.maximumScore) throw new Error('A maximum-score rule is required.');
  return round.scores.reduce((total, score) => {
    const capped = applyMaximumScore({
      gross: score.gross,
      par: score.par,
      pops: score.pops,
      rule: configuration.maximumScore!,
    });
    return (
      total +
      calculateStablefordPoints(capped.net, score.par, configuration.stablefordPointScale)
    );
  }, 0);
};

export const assignMaximumScorePoints = (event: ScoringEvent, rounds: ScoringRound[]) => {
  const placementPoints = parsePlacementPoints(event.strokePoints);
  if (placementPoints.length === 0) {
    for (const round of rounds) {
      round.pointsEarned = roundScoringPoints(getMaximumScoreStablefordPoints(event, round));
      round.matchPoints = 0;
    }
    return;
  }
  const ranked = rounds
    .map((round) => ({ round, total: getMaximumScoreCompetitionTotal(event, round) }))
    .sort((left, right) => left.total.net - right.total.net || left.total.gross - right.total.gross);

  let cursor = 0;
  while (cursor < ranked.length) {
    let end = cursor;
    while (
      end + 1 < ranked.length &&
      ranked[end + 1].total.net === ranked[cursor].total.net &&
      ranked[end + 1].total.gross === ranked[cursor].total.gross
    ) {
      end += 1;
    }
    const points = roundScoringPoints(
      placementPoints.slice(cursor, end + 1).reduce((sum, value) => sum + value, 0) /
        (end - cursor + 1),
    );
    for (let index = cursor; index <= end; index += 1) {
      ranked[index].round.pointsEarned = points;
      ranked[index].round.matchPoints = 0;
    }
    cursor = end + 1;
  }
};
