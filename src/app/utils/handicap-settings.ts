export const HANDICAP_HOLE_LIMITS = ['par-plus-1', 'par-plus-2', 'par-plus-3', 'par-plus-4', 'par-plus-5', 'none', 'handicap-adjusted'] as const;
export type HandicapHoleLimit = typeof HANDICAP_HOLE_LIMITS[number];
export type HandicapSettings = {
  handicapBestRounds: number;
  handicapWindow: number;
  handicapMultiplier: number;
  handicapHoleBasis: 9 | 18;
  handicapHoleLimit: HandicapHoleLimit;
};

export function normalizeHandicapSettings(source: {
  handicapBestRounds?: unknown; handicapWindow?: unknown;
  handicapMultiplier?: unknown; handicapHoleBasis?: unknown; handicapHoleLimit?: unknown; holeFormat?: unknown;
}): HandicapSettings {
  const handicapBestRounds = Number(source.handicapBestRounds ?? 6);
  const handicapWindow = Number(source.handicapWindow ?? 8);
  const handicapMultiplier = Number(source.handicapMultiplier ?? 1);
  if ((typeof source.handicapMultiplier !== 'undefined' && typeof source.handicapMultiplier !== 'number' && typeof source.handicapMultiplier !== 'string') || !Number.isFinite(handicapMultiplier) || handicapMultiplier < 0.01 || handicapMultiplier > 1) throw new Error('Handicap multiplier must be between 0.01 and 1.00.');
  const basis = Number(source.handicapHoleBasis ?? (source.holeFormat === '9' ? 9 : 18));
  const limit = source.handicapHoleLimit ?? 'handicap-adjusted';
  if (!Number.isInteger(handicapBestRounds) || !Number.isInteger(handicapWindow) || handicapBestRounds < 4 || handicapBestRounds > handicapWindow || handicapWindow > 20) {
    throw new Error('Handicap settings require whole numbers with 4 ≤ best rounds ≤ history window ≤ 20.');
  }
  if (basis !== 9 && basis !== 18) throw new Error('Handicap basis must be 9 or 18 holes.');
  const handicapHoleLimit = HANDICAP_HOLE_LIMITS.find((value) => value === limit);
  if (!handicapHoleLimit) throw new Error('Invalid handicap hole-score limit.');
  return { handicapBestRounds, handicapWindow, handicapMultiplier, handicapHoleBasis: basis, handicapHoleLimit };
}

export function parseStartingHandicap(value: unknown): number | null {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error('Handicap must be a number.');
  const handicap = Number(value);
  if (!Number.isFinite(handicap) || handicap < -10 || handicap > 54) throw new Error('Handicap must be between -10 and 54.');
  return handicap;
}

export function adjustHandicapHole(gross: number, par: number, pops: number, handicap: number | null, limit: HandicapHoleLimit): number {
  if (limit === 'none') return gross;
  const maximum = limit === 'handicap-adjusted'
    ? handicap == null ? par + 5 : par + 2 + pops
    : par + Number(limit.slice('par-plus-'.length));
  return Math.min(gross, maximum);
}
