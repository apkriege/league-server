export type ScoringHole = {
  num: number;
  par: number;
  hcp: number;
};

export type ScoredHole = {
  id: number;
  hole: number;
  par: number;
  gross: number;
  adjusted: number;
  net: number;
  pops: number;
};

export type ScoringRound = {
  playerId: number;
  teamId: number | null;
  opponentId: number | null;
  courseHandicap: number;
  gross: number;
  net: number;
  scores: ScoredHole[];
  pointsEarned: number;
  matchPoints: number;
};

export type ScoringEvent = {
  id: number;
  leagueId: number;
  ptsPerHole?: unknown;
  ptsPerMatch?: unknown;
  ptsPerTeamWin?: unknown;
  strokePoints?: unknown;
  scoringConfig?: unknown;
};

export type ScoringFlightPlayer = {
  playerId?: unknown;
  teamId?: unknown;
  player?: { teamId?: unknown } | null;
};

export type ScoringFlight = {
  teams?: Array<{ teamId?: unknown }>;
  players?: ScoringFlightPlayer[];
};

export type TeamEventPointsAccumulator = Map<
  string,
  { leagueId: number; eventId: number; teamId: number; points: number }
>;
