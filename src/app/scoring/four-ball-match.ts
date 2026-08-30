import { calculateStrokePops } from '../utils/tee-rating';
import { applyHandicapAllowance } from './team-handicap';
import type { ScoringHole, ScoringRound } from './types';

type FourBallSide = {
  teamId: number;
  rounds: ScoringRound[];
};

const buildRelativePops = (
  rounds: ScoringRound[],
  holes: ScoringHole[],
  allowance: number,
) => {
  const playingHandicaps = new Map(
    rounds.map((round) => [
      round.playerId,
      applyHandicapAllowance(round.courseHandicap, allowance),
    ]),
  );
  const baseline = Math.min(...playingHandicaps.values());
  return new Map(
    rounds.map((round) => [
      round.playerId,
      calculateStrokePops(
        Math.max(0, Number(playingHandicaps.get(round.playerId)) - baseline),
        holes,
      ),
    ]),
  );
};

const bestNetForSide = (
  side: FourBallSide,
  holeNumber: number,
  popsByPlayerId: Map<number, Map<number, number>>,
) => {
  let best: number | null = null;
  for (const round of side.rounds) {
    const score = round.scores.find((entry) => entry.hole === holeNumber);
    if (!score?.gross) continue;
    const net = score.gross - (popsByPlayerId.get(round.playerId)?.get(holeNumber) || 0);
    if (best == null || net < best) best = net;
  }
  return best;
};

export const calculateFourBallMatch = ({
  holes,
  left,
  right,
  pointsPerHole = 1,
  pointsPerMatch = 0,
  handicapAllowance = 1,
}: {
  holes: ScoringHole[];
  left: FourBallSide;
  right: FourBallSide;
  pointsPerHole?: number;
  pointsPerMatch?: number;
  handicapAllowance?: number;
}) => {
  if (left.rounds.length !== 2 || right.rounds.length !== 2) {
    throw new Error('Four-ball match play requires exactly two players on each side.');
  }
  const allRounds = [...left.rounds, ...right.rounds];
  const popsByPlayerId = buildRelativePops(allRounds, holes, handicapAllowance);
  let leftHolesWon = 0;
  let rightHolesWon = 0;
  let holesTied = 0;
  let leftHolePoints = 0;
  let rightHolePoints = 0;

  for (const hole of holes) {
    const leftNet = bestNetForSide(left, hole.num, popsByPlayerId);
    const rightNet = bestNetForSide(right, hole.num, popsByPlayerId);
    if (leftNet == null || rightNet == null) continue;
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
  }

  let leftMatchPoints = 0;
  let rightMatchPoints = 0;
  if (leftHolesWon === rightHolesWon && leftHolesWon + rightHolesWon + holesTied > 0) {
    leftMatchPoints = pointsPerMatch / 2;
    rightMatchPoints = pointsPerMatch / 2;
  } else if (leftHolesWon > rightHolesWon) {
    leftMatchPoints = pointsPerMatch;
  } else if (rightHolesWon > leftHolesWon) {
    rightMatchPoints = pointsPerMatch;
  }

  return {
    leftTeamId: left.teamId,
    rightTeamId: right.teamId,
    leftHolesWon,
    rightHolesWon,
    holesTied,
    leftHolePoints,
    rightHolePoints,
    leftMatchPoints,
    rightMatchPoints,
  };
};
