export type HandicapRule = { count: number; adjustment: number };

export function getHandicapRule(count: number, basis: 9 | 18 = 18): HandicapRule | null {
  if (count < 3) return null;
  const scale = basis / 18;
  if (count === 3) return { count: 1, adjustment: -2 * scale };
  if (count === 4) return { count: 1, adjustment: -scale };
  if (count === 5) return { count: 1, adjustment: 0 };
  if (count === 6) return { count: 2, adjustment: -scale };
  if (count <= 8) return { count: 2, adjustment: 0 };
  if (count <= 11) return { count: 3, adjustment: 0 };
  if (count <= 14) return { count: 4, adjustment: 0 };
  if (count <= 16) return { count: 5, adjustment: 0 };
  if (count <= 18) return { count: 6, adjustment: 0 };
  if (count === 19) return { count: 7, adjustment: 0 };
  return { count: 8, adjustment: 0 };
}

export const roundHandicap = (value: number) => {
  const rounded = Math.round((value + Number.EPSILON * Math.max(1, Math.abs(value))) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
};

export function applyHandicapCaps(index: number, lowIndex: number | null, basis: 9 | 18) {
  if (lowIndex == null) return index;
  const scale = basis / 18;
  const increase = index - lowIndex;
  const softCapped = increase > 3 * scale
    ? lowIndex + 3 * scale + (increase - 3 * scale) / 2
    : index;
  return roundHandicap(Math.min(softCapped, lowIndex + 5 * scale));
}

export function calculateHandicapIndexFromDifferentials(
  differentials: number[],
  options: { basis?: 9 | 18; lowIndex?: number | null } = {},
): number | null {
  const basis = options.basis ?? 18;
  if (differentials.some((value) => !Number.isFinite(value))) throw new Error('Invalid handicap differential.');
  const valid = differentials.slice(-20);
  const rule = getHandicapRule(valid.length, basis);
  if (!rule) return null;
  const used = [...valid].sort((a, b) => a - b).slice(0, rule.count);
  const base = used.reduce((sum, value) => sum + value, 0) / used.length + rule.adjustment;
  const capped = applyHandicapCaps(base, valid.length === 20 ? options.lowIndex ?? null : null, basis);
  return roundHandicap(Math.min(54 * basis / 18, capped));
}
