import { extractTeamId } from './flightGen';

const rosterKey = (players: any[] = []) =>
  players
    .map((player: any) => extractTeamId(player))
    .filter((id: number | null): id is number => id !== null)
    .sort((left: number, right: number) => left - right)
    .join(',');

export const normalizeEventFlightTeamIds = (
  flights: any[],
  existingFlightTeams: any[],
  incomingTeams: any[] = [],
) => {
  const existingTeams = Array.from(
    new Map(
      existingFlightTeams
        .map((entry: any) => entry?.team)
        .filter(Boolean)
        .map((team: any) => [Number(team.id), team]),
    ).values(),
  ) as any[];
  const currentTeamIds = new Set(
    existingFlightTeams
      .map((entry: any) => extractTeamId(entry?.teamId ?? entry?.team))
      .filter((id: number | null): id is number => id !== null),
  );
  const flightTeamIdToTeamId = new Map<number, number>();

  for (const entry of existingFlightTeams) {
    const relationId = extractTeamId(entry?.id);
    const teamId = extractTeamId(entry?.teamId ?? entry?.team);
    if (relationId !== null && teamId !== null) {
      flightTeamIdToTeamId.set(relationId, teamId);
    }
  }

  const incomingIdToTeamId = new Map<number, number>();
  for (const incomingTeam of Array.isArray(incomingTeams) ? incomingTeams : []) {
    const incomingId = extractTeamId(incomingTeam);
    if (incomingId === null) continue;

    const incomingRoster = rosterKey(incomingTeam?.players);
    const incomingName = String(incomingTeam?.name || '').trim().toLowerCase();
    const matchingTeam = existingTeams.find((team: any) => {
      if (incomingRoster && rosterKey(team.players) === incomingRoster) return true;
      return incomingName && String(team.name || '').trim().toLowerCase() === incomingName;
    });

    if (matchingTeam) {
      incomingIdToTeamId.set(incomingId, Number(matchingTeam.id));
    }
  }

  return (Array.isArray(flights) ? flights : []).map((flight: any) =>
    (Array.isArray(flight) ? flight : []).map((entry: any) => {
      const id = extractTeamId(entry);
      if (id === null || currentTeamIds.has(id)) {
        return entry;
      }
      return flightTeamIdToTeamId.get(id) ?? incomingIdToTeamId.get(id) ?? entry;
    }),
  );
};

export const resolveEventFlightTeams = async (
  tx: any,
  leagueId: number,
  eventId: number,
  flights: any[],
) => {
  const requestedIds = Array.from(
    new Set(
      (Array.isArray(flights) ? flights : [])
        .flatMap((flight: any) => (Array.isArray(flight) ? flight : []))
        .map(extractTeamId)
        .filter((id: number | null): id is number => id !== null),
    ),
  );

  if (requestedIds.length === 0) {
    return [];
  }

  return tx.team.findMany({
    where: {
      id: { in: requestedIds },
      deletedAt: null,
      OR: [{ leagueId }, { eventId }],
    },
    include: {
      players: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
  });
};
