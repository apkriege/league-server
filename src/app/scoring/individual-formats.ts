import { normalizeScoringConfiguration } from './config';
import { applyMaximumScore } from './maximum-score';
import { parsePlacementPoints, roundScoringPoints } from './numeric';
import { calculateStablefordPoints } from './stableford';
import { buildAbsolutePops, getCompetitionHoleNet } from './playing-handicap';
import type { ScoringEvent, ScoringHole, ScoringRound } from './types';

export const assignStablefordPoints = (
  event: ScoringEvent,
  rounds: ScoringRound[],
  holes: ScoringHole[] = [],
) => {
  const configuration = normalizeScoringConfiguration(event.scoringConfig, 'stableford');
  const popsByPlayerId = buildAbsolutePops(rounds, holes, configuration.handicapAllowance);
  for (const round of rounds) {
    round.pointsEarned = roundScoringPoints(
      round.scores.reduce(
        (total, score) =>
          total +
          calculateStablefordPoints(
            getCompetitionHoleNet(round, score.hole, popsByPlayerId) ?? score.net,
            score.par,
            configuration.stablefordPointScale,
          ),
        0,
      ),
    );
    round.matchPoints = 0;
  }
};

export const getMaximumScoreCompetitionTotal = (
  event: ScoringEvent,
  round: ScoringRound,
  pops?: Map<number, number>,
) => {
  const configuration = normalizeScoringConfiguration(event.scoringConfig, 'maximum-score');
  if (!configuration.maximumScore) throw new Error('A maximum-score rule is required.');
  return round.scores.reduce(
    (total, score) => {
      const capped = applyMaximumScore({
        gross: score.gross,
        par: score.par,
        pops: pops?.get(score.hole) ?? score.pops,
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
  pops?: Map<number, number>,
) => {
  const configuration = normalizeScoringConfiguration(event.scoringConfig, 'maximum-score');
  if (!configuration.maximumScore) throw new Error('A maximum-score rule is required.');
  return round.scores.reduce((total, score) => {
    const capped = applyMaximumScore({
      gross: score.gross,
      par: score.par,
      pops: pops?.get(score.hole) ?? score.pops,
      rule: configuration.maximumScore!,
    });
    return (
      total +
      calculateStablefordPoints(capped.net, score.par, configuration.stablefordPointScale)
    );
  }, 0);
};

export const assignMaximumScorePoints = (
  event: ScoringEvent,
  rounds: ScoringRound[],
  holes: ScoringHole[] = [],
) => {
  const configuration = normalizeScoringConfiguration(event.scoringConfig, 'maximum-score');
  const placementPoints = parsePlacementPoints(event.strokePoints);
  const popsByPlayerId = buildAbsolutePops(rounds, holes, configuration.handicapAllowance);
  if (placementPoints.length === 0) {
    for (const round of rounds) {
      round.pointsEarned = roundScoringPoints(
        getMaximumScoreStablefordPoints(event, round, popsByPlayerId.get(round.playerId)),
      );
      round.matchPoints = 0;
    }
    return;
  }
  const ranked = rounds
    .map((round) => ({
      round,
      total: getMaximumScoreCompetitionTotal(event, round, popsByPlayerId.get(round.playerId)),
    }))
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
