import { parsePlacementPoints, roundScoringPoints } from './numeric';
import { calculateStablefordPoints } from './stableford';
import { normalizeScoringConfiguration } from './config';
import type { ScoringEvent, ScoringRound } from './types';

export const assignStrokePlayPoints = (event: ScoringEvent, rounds: ScoringRound[]) => {
  const placementPoints = parsePlacementPoints(event.strokePoints);
  if (placementPoints.length > 0) {
    const ranked = [...rounds].sort((left, right) => {
      if (left.net !== right.net) return left.net - right.net;
      return left.gross - right.gross;
    });

    let cursor = 0;
    while (cursor < ranked.length) {
      let end = cursor;
      while (
        end + 1 < ranked.length &&
        ranked[end + 1].net === ranked[cursor].net &&
        ranked[end + 1].gross === ranked[cursor].gross
      ) {
        end += 1;
      }

      let pointsSum = 0;
      for (let index = cursor; index <= end; index += 1) {
        pointsSum += Number(placementPoints[index] ?? 0);
      }
      const tiedPoints = roundScoringPoints(pointsSum / (end - cursor + 1));
      for (let index = cursor; index <= end; index += 1) {
        ranked[index].pointsEarned = tiedPoints;
        ranked[index].matchPoints = 0;
      }
      cursor = end + 1;
    }
    return;
  }

  const configuration = normalizeScoringConfiguration(event.scoringConfig, 'stroke-play');
  for (const round of rounds) {
    round.pointsEarned = round.scores.reduce(
      (total, score) =>
        total +
        calculateStablefordPoints(
          score.net,
          score.par,
          configuration.stablefordPointScale,
        ),
      0,
    );
    round.matchPoints = 0;
  }
};
