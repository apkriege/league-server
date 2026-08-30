import { normalizeScoringConfiguration } from './config';
import { calculateFourBallMatch } from './four-ball-match';
import {
  getMaximumScoreCompetitionTotal,
  getMaximumScoreStablefordPoints,
} from './individual-formats';
import { parsePlacementPoints, roundScoringPoints, toScoringNumber } from './numeric';
import { calculateStablefordPoints } from './stableford';
import { addTeamEventPoints, getFlightTeamIds } from './team-points';
import type {
  ScoringEvent,
  ScoringFlight,
  ScoringHole,
  ScoringRound,
  TeamEventPointsAccumulator,
} from './types';

type AggregateTeamMode = 'stroke-play' | 'stableford' | 'maximum-score';

const roundsForTeam = (
  flight: ScoringFlight,
  teamId: number,
  roundsByPlayerId: Map<number, ScoringRound>,
) =>
  (flight.players || [])
    .filter((player) => Number(player.teamId ?? player.player?.teamId) === teamId)
    .map((player) => roundsByPlayerId.get(Number(player.playerId)))
    .filter((round): round is ScoringRound => Boolean(round));

export const assignTeamAggregatePoints = ({
  event,
  mode,
  flights,
  roundsByPlayerId,
  teamPoints,
}: {
  event: ScoringEvent;
  mode: AggregateTeamMode;
  flights: ScoringFlight[];
  roundsByPlayerId: Map<number, ScoringRound>;
  teamPoints: TeamEventPointsAccumulator;
}) => {
  for (const round of roundsByPlayerId.values()) {
    round.pointsEarned = 0;
    round.matchPoints = 0;
  }
  const placementPoints = parsePlacementPoints(event.strokePoints);
  const configuration = normalizeScoringConfiguration(event.scoringConfig, mode);

  for (const flight of flights) {
    const totals = getFlightTeamIds(flight).map((teamId) => {
      const rounds = roundsForTeam(flight, teamId, roundsByPlayerId);
      const total = rounds.reduce(
        (value, round) => {
          if (mode === 'maximum-score') {
            const competition = getMaximumScoreCompetitionTotal(event, round);
            return {
              gross: value.gross + competition.gross,
              net: value.net + competition.net,
              stableford:
                value.stableford + getMaximumScoreStablefordPoints(event, round),
            };
          }
          return {
            gross: value.gross + round.gross,
            net: value.net + round.net,
            stableford:
              value.stableford +
              (mode === 'stableford' || mode === 'stroke-play'
                ? round.scores.reduce(
                    (sum, score) =>
                      sum +
                      calculateStablefordPoints(
                        score.net,
                        score.par,
                        configuration.stablefordPointScale,
                      ),
                    0,
                  )
                : 0),
          };
        },
        { gross: 0, net: 0, stableford: 0 },
      );
      return { teamId, roundsPlayed: rounds.length, ...total };
    }).filter((total) => total.roundsPlayed > 0);

    if (placementPoints.length === 0) {
      for (const total of totals) {
        addTeamEventPoints(
          teamPoints,
          event.leagueId,
          event.id,
          total.teamId,
          roundScoringPoints(total.stableford),
        );
      }
      continue;
    }

    const ranked = [...totals].sort((left, right) =>
      mode === 'stableford'
        ? right.stableford - left.stableford || left.net - right.net
        : left.net - right.net || left.gross - right.gross,
    );
    let cursor = 0;
    while (cursor < ranked.length) {
      let end = cursor;
      const isTied = (index: number) =>
        mode === 'stableford'
          ? ranked[index].stableford === ranked[cursor].stableford &&
            ranked[index].net === ranked[cursor].net
          : ranked[index].net === ranked[cursor].net &&
            ranked[index].gross === ranked[cursor].gross;
      while (end + 1 < ranked.length && isTied(end + 1)) end += 1;
      const points = roundScoringPoints(
        placementPoints.slice(cursor, end + 1).reduce((sum, value) => sum + value, 0) /
          (end - cursor + 1),
      );
      for (let index = cursor; index <= end; index += 1) {
        addTeamEventPoints(teamPoints, event.leagueId, event.id, ranked[index].teamId, points);
      }
      cursor = end + 1;
    }
  }
};

export const assignFourBallMatchPoints = ({
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
  const configuration = normalizeScoringConfiguration(event.scoringConfig, 'four-ball-match');
  for (const flight of flights) {
    const [leftTeamId, rightTeamId] = getFlightTeamIds(flight);
    if (!leftTeamId || !rightTeamId) continue;
    const result = calculateFourBallMatch({
      holes,
      left: { teamId: leftTeamId, rounds: roundsForTeam(flight, leftTeamId, roundsByPlayerId) },
      right: { teamId: rightTeamId, rounds: roundsForTeam(flight, rightTeamId, roundsByPlayerId) },
      pointsPerHole: toScoringNumber(event.ptsPerHole, 0),
      pointsPerMatch: toScoringNumber(event.ptsPerTeamWin, 0),
      handicapAllowance: configuration.handicapAllowance,
    });
    addTeamEventPoints(
      teamPoints,
      event.leagueId,
      event.id,
      leftTeamId,
      result.leftHolePoints + result.leftMatchPoints,
    );
    addTeamEventPoints(
      teamPoints,
      event.leagueId,
      event.id,
      rightTeamId,
      result.rightHolePoints + result.rightMatchPoints,
    );
  }
};
