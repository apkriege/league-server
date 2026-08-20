export const LEAGUE_HOLE_FORMATS = ['9', '18', 'mixed'] as const;

export type LeagueHoleFormat = (typeof LEAGUE_HOLE_FORMATS)[number];
export type HandicapHoleBasis = 9 | 18;

export const isLeagueHoleFormat = (value: string): value is LeagueHoleFormat =>
  LEAGUE_HOLE_FORMATS.some((format) => format === value);

export const normalizeLeagueHoleFormat = (value: unknown): LeagueHoleFormat => {
  const normalized = String(value ?? '18').trim().toLowerCase();
  if (!isLeagueHoleFormat(normalized)) {
    throw new Error('League hole format must be 9, 18, or mixed.');
  }
  return normalized;
};

export const getHandicapHoleBasis = (holeFormat: unknown): HandicapHoleBasis =>
  normalizeLeagueHoleFormat(holeFormat) === '9' ? 9 : 18;

export const validateEventHolesForLeague = (holeFormat: unknown, eventHoles: unknown) => {
  const normalizedFormat = normalizeLeagueHoleFormat(holeFormat);
  const holes = Number(eventHoles);
  if (holes !== 9 && holes !== 18) {
    throw new Error('Invalid event holes: events must use 9 or 18 holes.');
  }
  if (normalizedFormat !== 'mixed' && holes !== Number(normalizedFormat)) {
    throw new Error(
      `Invalid event holes: a ${normalizedFormat}-hole league must use ${normalizedFormat}-hole events.`,
    );
  }
  return holes as 9 | 18;
};
