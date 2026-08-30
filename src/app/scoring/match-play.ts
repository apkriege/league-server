import { calculateMatchPops } from '../utils/tee-rating';
import { roundScoringPoints, toScoringNumber } from './numeric';
import { addTeamEventPoints, getFlightTeamIds } from './team-points';
import type {
  ScoringEvent,
  ScoringFlight,
  ScoringHole,
  ScoringRound,
  TeamEventPointsAccumulator,
} from './types';

const pairKey = (leftId: number, rightId: number) =>
  [leftId, rightId].sort((left, right) => left - right).join(':');

export const calculateMatchPlayPair = ({
  event,
  holes,
  left,
  right,
}: {
  event: ScoringEvent;
  holes: ScoringHole[];
  left: ScoringRound;
  right: ScoringRound;
}) => {
  const [leftPops, rightPops] = calculateMatchPops(
    left.courseHandicap,
    right.courseHandicap,
    holes,
  );
  const pointsPerHole = toScoringNumber(event.ptsPerHole, 0);
  const pointsPerMatch = toScoringNumber(event.ptsPerMatch, 0);
  let leftHolePoints = 0;
  let rightHolePoints = 0;
  let leftNetTotal = 0;
  let rightNetTotal = 0;
  let playedHoles = 0;
  let leftHolesWon = 0;
  let rightHolesWon = 0;
  let holesTied = 0;

  for (const hole of holes) {
    const leftScore = left.scores.find((score) => score.hole === hole.num);
    const rightScore = right.scores.find((score) => score.hole === hole.num);
    if (!leftScore?.gross || !rightScore?.gross) continue;

    const leftNet = leftScore.gross - (leftPops.get(hole.num) || 0);
    const rightNet = rightScore.gross - (rightPops.get(hole.num) || 0);
    leftNetTotal += leftNet;
    rightNetTotal += rightNet;
    playedHoles += 1;

    if (pointsPerHole > 0) {
      if (leftNet === rightNet) {
        holesTied += 1;
        leftHolePoints += pointsPerHole / 2;
        rightHolePoints += pointsPerHole / 2;
      } else if (leftNet < rightNet) {
        leftHolesWon += 1;
        leftHolePoints += pointsPerHole;
      } else {
        rightHolesWon += 1;
        rightHolePoints += pointsPerHole;
      }
    } else if (leftNet === rightNet) {
      holesTied += 1;
    } else if (leftNet < rightNet) {
      leftHolesWon += 1;
    } else {
      rightHolesWon += 1;
    }
  }

  let leftMatchPoints = 0;
  let rightMatchPoints = 0;
  if (pointsPerMatch > 0 && playedHoles > 0) {
    if (leftHolesWon === rightHolesWon) {
      leftMatchPoints = pointsPerMatch / 2;
      rightMatchPoints = pointsPerMatch / 2;
    } else if (leftHolesWon > rightHolesWon) {
      leftMatchPoints = pointsPerMatch;
    } else {
      rightMatchPoints = pointsPerMatch;
    }
  }

  return {
    leftHolePoints,
    leftMatchPoints,
    rightHolePoints,
    rightMatchPoints,
    leftNetTotal,
    rightNetTotal,
    playedHoles,
    leftHolesWon,
    rightHolesWon,
    holesTied,
  };
};

export const assignMatchPlayPoints = ({
  event,
  holes,
  rounds,
}: {
  event: ScoringEvent;
  holes: ScoringHole[];
  rounds: ScoringRound[];
}) => {
  const byPlayerId = new Map(rounds.map((round) => [round.playerId, round]));
  const processedPairs = new Set<string>();

  for (const round of rounds) {
    if (!round.opponentId) continue;
    const opponent = byPlayerId.get(round.opponentId);
    if (!opponent) continue;

    const key = pairKey(round.playerId, opponent.playerId);
    if (processedPairs.has(key)) continue;
    processedPairs.add(key);

    const points = calculateMatchPlayPair({ event, holes, left: round, right: opponent });
    round.pointsEarned = roundScoringPoints(points.leftHolePoints);
    round.matchPoints = roundScoringPoints(points.leftMatchPoints);
    opponent.pointsEarned = roundScoringPoints(points.rightHolePoints);
    opponent.matchPoints = roundScoringPoints(points.rightMatchPoints);
  }
};

export const assignTeamMatchPlayPoints = ({
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
  assignMatchPlayPoints({ event, holes, rounds: [...roundsByPlayerId.values()] });

  for (const flight of flights) {
    const teamIds = getFlightTeamIds(flight);
    if (teamIds.length < 2) continue;

    const [leftTeamId, rightTeamId] = teamIds;
    let leftHolesWon = 0;
    let rightHolesWon = 0;
    let playedMatchups = 0;
    const processedPairs = new Set<string>();

    for (const flightPlayer of flight.players || []) {
      const round = roundsByPlayerId.get(Number(flightPlayer.playerId));
      if (!round?.opponentId) continue;
      const opponent = roundsByPlayerId.get(round.opponentId);
      if (!opponent) continue;

      const key = pairKey(round.playerId, opponent.playerId);
      if (processedPairs.has(key)) continue;
      processedPairs.add(key);

      const points = calculateMatchPlayPair({ event, holes, left: round, right: opponent });
      const leftIsTeamOne = round.teamId === leftTeamId;
      const rightIsTeamOne = opponent.teamId === leftTeamId;

      if (leftIsTeamOne && opponent.teamId === rightTeamId) {
        leftHolesWon += points.leftHolesWon;
        rightHolesWon += points.rightHolesWon;
        playedMatchups += points.playedHoles > 0 ? 1 : 0;
      } else if (rightIsTeamOne && round.teamId === rightTeamId) {
        leftHolesWon += points.rightHolesWon;
        rightHolesWon += points.leftHolesWon;
        playedMatchups += points.playedHoles > 0 ? 1 : 0;
      }
    }

    const teamWinPoints = toScoringNumber(event.ptsPerTeamWin, 0);
    if (teamWinPoints <= 0 || playedMatchups === 0) continue;

    if (leftHolesWon === rightHolesWon) {
      addTeamEventPoints(teamPoints, event.leagueId, event.id, leftTeamId, teamWinPoints / 2);
      addTeamEventPoints(teamPoints, event.leagueId, event.id, rightTeamId, teamWinPoints / 2);
    } else if (leftHolesWon > rightHolesWon) {
      addTeamEventPoints(teamPoints, event.leagueId, event.id, leftTeamId, teamWinPoints);
    } else {
      addTeamEventPoints(teamPoints, event.leagueId, event.id, rightTeamId, teamWinPoints);
    }
  }
};
