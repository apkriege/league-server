export const toScoringNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const roundScoringPoints = (value: number) => Math.round(value * 10) / 10;

export const parsePlacementPoints = (raw: unknown): number[] => {
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  return values
    .filter((value) => value != null && String(value).trim() !== '')
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0);
};
