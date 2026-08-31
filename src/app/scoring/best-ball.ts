import { parsePlacementPoints, roundScoringPoints } from './numeric';
import { calculateStablefordPoints } from './stableford';
import { normalizeScoringConfiguration } from './config';
import { addTeamEventPoints, getBestNetScoreForHole, getFlightTeamIds } from './team-points';
import type {
  ScoringEvent,
  ScoringFlight,
  ScoringHole,
  ScoringRound,
  TeamEventPointsAccumulator,
} from './types';

export const assignBestBallPoints = ({
  event,
  holes,
  flights,
  roundsByPlayerId,
  teamPoints,
}: {
  event: ScoringEvent;
  holes: ScoringHole[];
  flights: ScoringFlight[];
  roundsByPlayerId: Map<number, ScoringRound>;
  teamPoints: TeamEventPointsAccumulator;
}) => {
  for (const round of roundsByPlayerId.values()) {
    round.pointsEarned = 0;
    round.matchPoints = 0;
  }

  const placementPoints = parsePlacementPoints(event.strokePoints);
  const configuration = normalizeScoringConfiguration(event.scoringConfig, 'best-ball');

  for (const flight of flights) {
    const teamIds = getFlightTeamIds(flight);
    if (teamIds.length < 2) continue;
    const [leftTeamId, rightTeamId] = teamIds;

    const roundsForTeam = (teamId: number) =>
      (flight.players || [])
        .filter((player) => Number(player.teamId ?? player.player?.teamId) === teamId)
        .map((player) => roundsByPlayerId.get(Number(player.playerId)))
        .filter((round): round is ScoringRound => Boolean(round));

    const leftRounds = roundsForTeam(leftTeamId);
    const rightRounds = roundsForTeam(rightTeamId);
    if (leftRounds.length === 0 || rightRounds.length === 0) continue;

    let leftPoints = 0;
    let rightPoints = 0;
    let leftNetTotal = 0;
    let rightNetTotal = 0;

    for (const hole of holes) {
      const bestLeft = getBestNetScoreForHole(leftRounds, hole.num);
      const bestRight = getBestNetScoreForHole(rightRounds, hole.num);
      if (bestLeft == null || bestRight == null) continue;

      leftNetTotal += bestLeft.net;
      rightNetTotal += bestRight.net;
      if (placementPoints.length === 0) {
        leftPoints += calculateStablefordPoints(
          bestLeft.net,
          bestLeft.par,
          configuration.stablefordPointScale,
        );
        rightPoints += calculateStablefordPoints(
          bestRight.net,
          bestRight.par,
          configuration.stablefordPointScale,
        );
      }
    }

    if (placementPoints.length > 0) {
      if (leftNetTotal === rightNetTotal) {
        const tiedPoints = roundScoringPoints(
          (Number(placementPoints[0] ?? 0) + Number(placementPoints[1] ?? 0)) / 2,
        );
        leftPoints = tiedPoints;
        rightPoints = tiedPoints;
      } else if (leftNetTotal < rightNetTotal) {
        leftPoints = Number(placementPoints[0] ?? 0);
        rightPoints = Number(placementPoints[1] ?? 0);
      } else {
        leftPoints = Number(placementPoints[1] ?? 0);
        rightPoints = Number(placementPoints[0] ?? 0);
      }
    }

    addTeamEventPoints(teamPoints, event.leagueId, event.id, leftTeamId, leftPoints);
    addTeamEventPoints(teamPoints, event.leagueId, event.id, rightTeamId, rightPoints);
  }
};
