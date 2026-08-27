export type EventTeamStandingRound = {
  playerId: number;
  pointsEarned: number | null;
  matchPoints: number | null;
  player: { firstName: string; lastName: string };
};

export type EventTeamAssignment = { teamId: number; name: string };
export type EventPlayerTeamAssignment = { playerId: number; teamId: number | null };
export type EventTeamPoints = { teamId: number; points: number };

export type EventTeamStanding = {
  rank: number;
  teamId: number;
  name: string;
  players: Array<{ playerId: number; name: string; points: number }>;
  playerPoints: number;
  teamPoints: number;
  totalPoints: number;
};

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

export const calculateEventTeamStandings = (
  teams: EventTeamAssignment[],
  playerAssignments: EventPlayerTeamAssignment[],
  teamPointRows: EventTeamPoints[],
  rounds: EventTeamStandingRound[],
): EventTeamStanding[] => {
  const teamById = new Map<number, EventTeamAssignment>();
  teams.forEach((team) => teamById.set(Number(team.teamId), team));

  const teamIdByPlayerId = new Map<number, number>();
  playerAssignments.forEach((assignment) => {
    const teamId = Number(assignment.teamId || 0);
    if (teamId > 0) teamIdByPlayerId.set(Number(assignment.playerId), teamId);
  });

  const teamPointsById = new Map<number, number>();
  teamPointRows.forEach((row) => {
    teamPointsById.set(Number(row.teamId), Number(row.points || 0));
  });

  const playersByTeamId = new Map<number, EventTeamStanding['players']>();
  for (const round of rounds) {
    const teamId = teamIdByPlayerId.get(Number(round.playerId));
    if (!teamId || !teamById.has(teamId)) continue;

    const players = playersByTeamId.get(teamId) ?? [];
    players.push({
      playerId: Number(round.playerId),
      name: `${round.player.firstName} ${round.player.lastName}`.trim(),
      points: roundToOneDecimal(
        Number(round.pointsEarned || 0) + Number(round.matchPoints || 0),
      ),
    });
    playersByTeamId.set(teamId, players);
  }

  const standings = [...teamById.values()].map((team) => {
    const teamId = Number(team.teamId);
    const players = (playersByTeamId.get(teamId) ?? []).sort(
      (left, right) => right.points - left.points || left.name.localeCompare(right.name),
    );
    const playerPoints = roundToOneDecimal(
      players.reduce((total, player) => total + player.points, 0),
    );
    const teamPoints = roundToOneDecimal(teamPointsById.get(teamId) || 0);

    return {
      rank: 0,
      teamId,
      name: team.name,
      players,
      playerPoints,
      teamPoints,
      totalPoints: roundToOneDecimal(playerPoints + teamPoints),
    };
  });

  standings.sort(
    (left, right) =>
      right.totalPoints - left.totalPoints ||
      right.playerPoints - left.playerPoints ||
      left.name.localeCompare(right.name),
  );

  let previousTotal: number | null = null;
  let previousRank = 0;
  return standings.map((standing, index) => {
    const rank = previousTotal === standing.totalPoints ? previousRank : index + 1;
    previousTotal = standing.totalPoints;
    previousRank = rank;
    return { ...standing, rank };
  });
};
