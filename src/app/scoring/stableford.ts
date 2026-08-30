export type StablefordPointScale = {
  albatrossOrBetter: number;
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  doubleBogeyOrWorse: number;
};

export const DEFAULT_STABLEFORD_POINT_SCALE: StablefordPointScale = {
  albatrossOrBetter: 4,
  eagle: 4,
  birdie: 3,
  par: 2,
  bogey: 1,
  doubleBogeyOrWorse: 0,
};

const keys = Object.keys(DEFAULT_STABLEFORD_POINT_SCALE) as Array<keyof StablefordPointScale>;

export const normalizeStablefordPointScale = (raw: unknown): StablefordPointScale => {
  if (raw == null) return { ...DEFAULT_STABLEFORD_POINT_SCALE };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Stableford point values must be an object.');
  }

  const source = raw as Record<string, unknown>;
  const scale = { ...DEFAULT_STABLEFORD_POINT_SCALE };
  for (const key of keys) {
    if (source[key] === undefined) continue;
    const value = Number(source[key]);
    if (!Number.isFinite(value)) throw new Error(`Stableford ${key} points must be numeric.`);
    scale[key] = value;
  }
  return scale;
};

export const calculateStablefordPoints = (
  net: number,
  par: number,
  scale: StablefordPointScale = DEFAULT_STABLEFORD_POINT_SCALE,
) => {
  const difference = net - par;
  if (difference <= -3) return scale.albatrossOrBetter;
  if (difference === -2) return scale.eagle;
  if (difference === -1) return scale.birdie;
  if (difference === 0) return scale.par;
  if (difference === 1) return scale.bogey;
  return scale.doubleBogeyOrWorse;
};
