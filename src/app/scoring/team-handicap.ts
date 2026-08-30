const rounded = (value: number) => Math.round(value);

export const applyHandicapAllowance = (courseHandicap: number, allowance = 1) => {
  if (!Number.isFinite(courseHandicap)) throw new Error('Course handicap must be numeric.');
  if (!Number.isFinite(allowance) || allowance < 0 || allowance > 1) {
    throw new Error('Handicap allowance must be between 0 and 1.');
  }
  return rounded(courseHandicap * allowance);
};

export const calculateAlternateShotHandicap = (courseHandicaps: number[]) => {
  if (courseHandicaps.length !== 2 || courseHandicaps.some((value) => !Number.isFinite(value))) {
    throw new Error('Alternate shot requires two valid course handicaps.');
  }
  return rounded((courseHandicaps[0] + courseHandicaps[1]) * 0.5);
};

const scrambleAllowances: Record<number, number[]> = {
  2: [0.35, 0.15],
  3: [0.3, 0.2, 0.1],
  4: [0.25, 0.2, 0.15, 0.1],
};

export const calculateScrambleHandicap = (courseHandicaps: number[]) => {
  const allowances = scrambleAllowances[courseHandicaps.length];
  if (!allowances || courseHandicaps.some((value) => !Number.isFinite(value))) {
    throw new Error('Scramble handicap calculation requires two, three, or four players.');
  }
  const ordered = [...courseHandicaps].sort((left, right) => left - right);
  return rounded(
    ordered.reduce((total, handicap, index) => total + handicap * allowances[index], 0),
  );
};
