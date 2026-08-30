type EventTeamPointsRow = {
  teamId: number;
  points: number | null;
};

type TeamEventRound = {
  id: number;
  playerId: number;
  date: Date | string | null;
  gross: number | null;
  net: number | null;
  pointsEarned: number | null;
  matchPoints: number | null;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  player: {
    id: number;
    firstName: string;
    lastName: string;
  };
};

type TeamEventFlight = {
  id: number;
  startsAt: Date | string;
  teams: Array<{
    teamId: number;
    opponentId: number | null;
    team: { id: number; name: string } | null;
  }>;
  players: Array<{
    playerId: number;
    teamId: number | null;
    player: { teamId: number | null };
  }>;
};

export type TeamProfileEvent = {
  id: number;
  name: string;
  startsAt: Date | string;
  timeZone: string;
  format: string;
  scoringMode: string;
  type: string;
  status: string;
  holes: number;
  course: { name: string } | null;
  teamEventPoints: EventTeamPointsRow[];
  flights: TeamEventFlight[];
  rounds: TeamEventRound[];
};

export type TeamEventResult = {
  id: number;
  name: string;
  startsAt: Date | string;
  timeZone: string;
  format: string;
  scoringMode: string;
  type: string;
  status: string;
  holes: number;
  courseName: string | null;
  flightId: number | null;
  flightStartsAt: Date | string | null;
  isAssigned: boolean;
  opponents: Array<{
    id: number;
    name: string;
    playerPoints: number;
    teamPoints: number;
    totalPoints: number | null;
  }>;
  playerPoints: number;
  teamPoints: number;
  totalPoints: number | null;
  playerRounds: Array<{
    id: number;
    playerId: number;
    playerName: string;
    date: Date | string | null;
    gross: number | null;
    net: number | null;
    points: number;
    eagles: number;
    birdies: number;
    pars: number;
    bogeys: number;
  }>;
};

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

export const buildTeamEventResults = (
  teamId: number,
  events: readonly TeamProfileEvent[],
): TeamEventResult[] => {
  return events.map((event) => {
    const assignedFlights = event.flights.filter(
      (flight) =>
        flight.teams.some((assignment) => Number(assignment.teamId) === teamId) ||
        flight.players.some(
          (assignment) =>
            Number(assignment.teamId ?? assignment.player.teamId ?? 0) === teamId,
        ),
    );
    const assignedPlayerIdsByTeamId = new Map<number, Set<number>>();
    const opponents = new Map<number, string>();

    for (const flight of assignedFlights) {
      for (const assignment of flight.players) {
        const assignedTeamId = Number(assignment.teamId ?? assignment.player.teamId ?? 0);
        if (assignedTeamId <= 0) continue;

        const playerIds = assignedPlayerIdsByTeamId.get(assignedTeamId) ?? new Set<number>();
        playerIds.add(Number(assignment.playerId));
        assignedPlayerIdsByTeamId.set(assignedTeamId, playerIds);
      }

      const teamAssignment = flight.teams.find(
        (assignment) => Number(assignment.teamId) === teamId,
      );
      const explicitOpponentId = Number(teamAssignment?.opponentId || 0);

      for (const assignment of flight.teams) {
        const assignmentTeamId = Number(assignment.teamId);
        if (assignmentTeamId === teamId) continue;
        if (explicitOpponentId > 0 && assignmentTeamId !== explicitOpponentId) continue;

        opponents.set(
          assignmentTeamId,
          String(assignment.team?.name || `Team ${assignmentTeamId}`),
        );
      }

      if (explicitOpponentId > 0 && !opponents.has(explicitOpponentId)) {
        opponents.set(explicitOpponentId, `Team ${explicitOpponentId}`);
      }
    }

    const assignedPlayerIds = assignedPlayerIdsByTeamId.get(teamId) ?? new Set<number>();
    const playerRounds = event.rounds
      .filter((round) => assignedPlayerIds.has(Number(round.playerId)))
      .map((round) => ({
        id: Number(round.id),
        playerId: Number(round.playerId),
        playerName:
          `${round.player.firstName || ''} ${round.player.lastName || ''}`.trim() ||
          'Unnamed player',
        date: round.date,
        gross: round.gross == null ? null : Number(round.gross),
        net: round.net == null ? null : Number(round.net),
        points: roundToOneDecimal(
          Number(round.pointsEarned || 0) + Number(round.matchPoints || 0),
        ),
        eagles: Number(round.eagles || 0),
        birdies: Number(round.birdies || 0),
        pars: Number(round.pars || 0),
        bogeys: Number(round.bogeys || 0),
      }))
      .sort((left, right) => left.playerName.localeCompare(right.playerName));

    const playerPoints = roundToOneDecimal(
      playerRounds.reduce((total, round) => total + round.points, 0),
    );
    const teamPointsByTeamId = new Map(
      event.teamEventPoints.map((row) => [Number(row.teamId), Number(row.points || 0)]),
    );
    const teamPoints = roundToOneDecimal(teamPointsByTeamId.get(teamId) || 0);
    const status = String(event.status || '').toLowerCase();
    const hasRecordedResult =
            status === 'completed' ||
      teamPointsByTeamId.has(teamId) ||
      playerRounds.length > 0;
    const opponentResults = [...opponents.entries()]
      .map(([opponentId, name]) => {
        const opponentPlayerIds = assignedPlayerIdsByTeamId.get(opponentId) ?? new Set<number>();
        const opponentRounds = event.rounds.filter((round) =>
          opponentPlayerIds.has(Number(round.playerId)),
        );
        const opponentPlayerPoints = roundToOneDecimal(
          opponentRounds.reduce(
            (total, round) =>
              total + Number(round.pointsEarned || 0) + Number(round.matchPoints || 0),
            0,
          ),
        );
        const opponentTeamPoints = roundToOneDecimal(
          teamPointsByTeamId.get(opponentId) || 0,
        );
        const opponentHasResult =
                    status === 'completed' ||
          teamPointsByTeamId.has(opponentId) ||
          opponentRounds.length > 0;

        return {
          id: opponentId,
          name,
          playerPoints: opponentPlayerPoints,
          teamPoints: opponentTeamPoints,
          totalPoints: opponentHasResult
            ? roundToOneDecimal(opponentPlayerPoints + opponentTeamPoints)
            : null,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    return {
      id: Number(event.id),
      name: String(event.name || 'Event'),
      startsAt: event.startsAt,
      timeZone: String(event.timeZone || 'UTC'),
      format: String(event.format || ''),
      scoringMode: String(event.scoringMode || ''),
      type: String(event.type || ''),
      status: String(event.status || ''),
      holes: Number(event.holes || 0),
      courseName: event.course?.name || null,
      flightId: assignedFlights[0]?.id ? Number(assignedFlights[0].id) : null,
      flightStartsAt: assignedFlights[0]?.startsAt || null,
      isAssigned: assignedFlights.length > 0,
      opponents: opponentResults,
      playerPoints,
      teamPoints,
      totalPoints: hasRecordedResult ? roundToOneDecimal(playerPoints + teamPoints) : null,
      playerRounds,
    };
  });
};
