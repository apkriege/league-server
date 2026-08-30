export const toScoringNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const roundScoringPoints = (value: number) => Math.round(value * 10) / 10;

export const parsePlacementPoints = (raw: unknown): number[] => {
  if (Array.isArray(raw)) {
    return raw.map(Number).filter((value) => Number.isFinite(value) && value >= 0);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value >= 0);
  }
  return [];
};
