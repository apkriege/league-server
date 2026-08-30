export type FlightOpponentAssignment = {
  playerId: number;
  teamId?: number | null;
  opponentId?: number | null;
};

export type SubmittedPlayerOpponent = {
  playerId: number;
  opponentId?: number | null;
};

type ResolveScoreSubmissionOpponentsOptions = {
  eventFormat: string;
  scoringFamily: string;
  assignments: FlightOpponentAssignment[];
  submittedPlayers: SubmittedPlayerOpponent[];
};

const optionalId = (value: unknown) => (value == null ? null : Number(value));

export const resolveScoreSubmissionOpponents = ({
  eventFormat,
  scoringFamily,
  assignments,
  submittedPlayers,
}: ResolveScoreSubmissionOpponentsOptions): Map<number, number | null> => {
  const resolved = new Map<number, number | null>();

  if (scoringFamily !== 'match') {
    submittedPlayers.forEach((player) => resolved.set(Number(player.playerId), null));
    return resolved;
  }

  const assignmentByPlayerId = new Map(
    assignments.map((assignment) => [Number(assignment.playerId), assignment]),
  );
  const submittedOpponentByPlayerId = new Map(
    submittedPlayers.map((player) => [
      Number(player.playerId),
      optionalId(player.opponentId),
    ]),
  );

  submittedPlayers.forEach((player) => {
    const playerId = Number(player.playerId);
    const assignment = assignmentByPlayerId.get(playerId);
    const assignedOpponentId = optionalId(assignment?.opponentId);
    const submittedOpponentId = optionalId(player.opponentId);

    if (assignedOpponentId != null) {
      if (submittedOpponentId !== assignedOpponentId) {
        throw new Error('Player opponents must match the flight assignments.');
      }
      resolved.set(playerId, assignedOpponentId);
      return;
    }

    if (submittedOpponentId == null) {
      resolved.set(playerId, null);
      return;
    }

    const opponentAssignment = assignmentByPlayerId.get(submittedOpponentId);
    const reciprocalOpponentId = submittedOpponentByPlayerId.get(submittedOpponentId);
    const isSameTeam =
      eventFormat === 'team' &&
      assignment?.teamId != null &&
      opponentAssignment?.teamId != null &&
      Number(assignment.teamId) === Number(opponentAssignment.teamId);

    if (
      !Number.isInteger(submittedOpponentId) ||
      submittedOpponentId <= 0 ||
      submittedOpponentId === playerId ||
      !opponentAssignment ||
      reciprocalOpponentId !== playerId ||
      isSameTeam
    ) {
      throw new Error('Player opponents must be reciprocal matchups within the flight.');
    }

    resolved.set(playerId, submittedOpponentId);
  });

  return resolved;
};
