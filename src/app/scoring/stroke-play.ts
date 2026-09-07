import { parsePlacementPoints, roundScoringPoints } from './numeric';
import { calculateStablefordPoints } from './stableford';
import { normalizeScoringConfiguration } from './config';
import { buildAbsolutePops, getCompetitionHoleNet, getCompetitionNetTotal } from './playing-handicap';
import type { ScoringEvent, ScoringHole, ScoringRound } from './types';

export const assignStrokePlayPoints = (
  event: ScoringEvent,
  rounds: ScoringRound[],
  holes: ScoringHole[] = [],
) => {
  const configuration = normalizeScoringConfiguration(event.scoringConfig, 'stroke-play');
  const placementPoints = parsePlacementPoints(event.strokePoints);
  const popsByPlayerId = buildAbsolutePops(rounds, holes, configuration.handicapAllowance);
  if (placementPoints.length > 0) {
    const ranked = rounds
      .map((round) => ({ round, net: getCompetitionNetTotal(round, popsByPlayerId) }))
      .sort((left, right) => left.net - right.net || left.round.gross - right.round.gross);

    let cursor = 0;
    while (cursor < ranked.length) {
      let end = cursor;
      while (
        end + 1 < ranked.length &&
        ranked[end + 1].net === ranked[cursor].net &&
        ranked[end + 1].round.gross === ranked[cursor].round.gross
      ) {
        end += 1;
      }

      let pointsSum = 0;
      for (let index = cursor; index <= end; index += 1) {
        pointsSum += Number(placementPoints[index] ?? 0);
      }
      const tiedPoints = roundScoringPoints(pointsSum / (end - cursor + 1));
      for (let index = cursor; index <= end; index += 1) {
        ranked[index].round.pointsEarned = tiedPoints;
        ranked[index].round.matchPoints = 0;
      }
      cursor = end + 1;
    }
    return;
  }

  for (const round of rounds) {
    round.pointsEarned = round.scores.reduce(
      (total, score) =>
        total +
        calculateStablefordPoints(
          getCompetitionHoleNet(round, score.hole, popsByPlayerId) ?? score.net,
          score.par,
          configuration.stablefordPointScale,
        ),
      0,
    );
    round.matchPoints = 0;
  }
};
