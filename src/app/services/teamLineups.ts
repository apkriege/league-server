import { getScoringMode, type ScoringMode } from '../scoring';

export const MIN_TEAM_SIZE = 1;
export const MAX_TEAM_SIZE = 4;

const positiveIds = (values: unknown) =>
  Array.isArray(values)
    ? [...new Set(values.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [];

export const normalizeTeamCount = (value: unknown, fallback: number, label: string) => {
  const count = value == null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(count) || count < MIN_TEAM_SIZE || count > MAX_TEAM_SIZE) {
    throw new Error(`${label} must be a whole number from ${MIN_TEAM_SIZE} to ${MAX_TEAM_SIZE}.`);
  }
  return count;
};

export const getRequiredTeamPlayers = ({
  requested,
  leagueDefault,
  scoringMode,
}: {
  requested: unknown;
  leagueDefault: unknown;
  scoringMode: unknown;
}) => {
  const mode = getScoringMode(scoringMode).id as ScoringMode;
  const count = normalizeTeamCount(
    requested,
    normalizeTeamCount(leagueDefault, 2, 'League players per team event'),
    'Players per team event',
  );
  if ((mode === 'four-ball-match' || mode === 'alternate-shot') && count !== 2) {
    throw new Error(`${getScoringMode(mode).label} requires exactly two players per team.`);
  }
  if (mode === 'scramble' && (count < 2 || count > 4)) {
    throw new Error('Scramble requires two, three, or four players per team.');
  }
  if (mode === 'match-play' && count < 2) {
    throw new Error('Team match play requires at least two players per team.');
  }
  if (mode === 'best-ball' && count < 2) {
    throw new Error('Best ball requires at least two players per team.');
  }
  return count;
};

type LeaguePlayer = {
  id: number;
  teamId?: number | null;
  type?: string | null;
};

type LeagueTeam = {
  id: number;
  name?: string | null;
  players?: LeaguePlayer[];
};

const lineupEntries = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([teamId, playerIds]) => ({ teamId, playerIds }));
  }
  return [];
};

export const resolveTeamEventLineups = ({
  league,
  flights,
  lineups,
  requiredPlayers,
}: {
  league: { players?: LeaguePlayer[]; teams?: LeagueTeam[] };
  flights: unknown;
  lineups: unknown;
  requiredPlayers: number;
}) => {
  const teamsById = new Map((league.teams || []).map((team) => [Number(team.id), team]));
  const playersById = new Map((league.players || []).map((player) => [Number(player.id), player]));
  const scheduledTeamIds = new Set<number>();
  for (const flight of Array.isArray(flights) ? flights : []) {
    for (const rawTeamId of Array.isArray(flight) ? flight : []) {
      const teamId = Number(
        rawTeamId && typeof rawTeamId === 'object'
          ? (rawTeamId as any).teamId ?? (rawTeamId as any).id
          : rawTeamId,
      );
      if (Number.isInteger(teamId) && teamId > 0) scheduledTeamIds.add(teamId);
    }
  }

  const submitted = new Map<number, number[]>();
  for (const entry of lineupEntries(lineups)) {
    const teamId = Number((entry as any)?.teamId);
    if (!Number.isInteger(teamId) || teamId <= 0 || submitted.has(teamId)) {
      throw new Error('Team lineups must contain unique valid team IDs.');
    }
    submitted.set(teamId, positiveIds((entry as any)?.playerIds ?? (entry as any)?.players));
  }

  const usedPlayerIds = new Set<number>();
  const resolvedTeams: LeagueTeam[] = [];
  for (const teamId of scheduledTeamIds) {
    const team = teamsById.get(teamId);
    if (!team) throw new Error(`Team ${teamId} does not belong to this league.`);
    const rosterIds = positiveIds((team.players || []).map((player) => player.id));
    const selectedIds = submitted.get(teamId) ?? (rosterIds.length === requiredPlayers ? rosterIds : []);
    if (selectedIds.length !== requiredPlayers) {
      throw new Error(`Team ${team.name || teamId} must have exactly ${requiredPlayers} selected players.`);
    }
    const selectedPlayers = selectedIds.map((playerId) => {
      const player = playersById.get(playerId);
      if (!player) throw new Error(`Selected player ${playerId} does not belong to this league.`);
      const isTeamMember = rosterIds.includes(playerId) || Number(player.teamId) === teamId;
      const type = String(player.type || '').toLowerCase();
      const isSubstitute = type === 'sub' || type === 'substitute';
      if (!isTeamMember && !isSubstitute) {
        throw new Error(`Selected player ${playerId} must belong to ${team.name || `Team ${teamId}`} or be a substitute.`);
      }
      if (usedPlayerIds.has(playerId)) {
        throw new Error(`Selected player ${playerId} cannot play for more than one team in the same event.`);
      }
      usedPlayerIds.add(playerId);
      return player;
    });
    resolvedTeams.push({ ...team, players: selectedPlayers });
  }

  return {
    lineups: resolvedTeams.map((team) => ({
      teamId: Number(team.id),
      playerIds: (team.players || []).map((player) => Number(player.id)),
    })),
    teams: (league.teams || []).map(
      (team) => resolvedTeams.find((resolved) => Number(resolved.id) === Number(team.id)) ?? team,
    ),
  };
};
