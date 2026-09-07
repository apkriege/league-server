const rounded = (value: number) => Math.round(value);

export const applyHandicapAllowance = (playerHandicap: number, allowance = 1) => {
  if (!Number.isFinite(playerHandicap)) throw new Error('Player handicap must be numeric.');
  if (!Number.isFinite(allowance) || allowance < 0 || allowance > 1) {
    throw new Error('Handicap allowance must be between 0 and 1.');
  }
  return rounded(playerHandicap * allowance);
};

export const calculateAlternateShotHandicap = (playerHandicaps: number[]) => {
  if (playerHandicaps.length !== 2 || playerHandicaps.some((value) => !Number.isFinite(value))) {
    throw new Error('Alternate shot requires two valid player handicaps.');
  }
  return rounded((playerHandicaps[0] + playerHandicaps[1]) * 0.5);
};

const scrambleAllowances: Record<number, number[]> = {
  2: [0.35, 0.15],
  3: [0.3, 0.2, 0.1],
  4: [0.25, 0.2, 0.15, 0.1],
};

export const calculateScrambleHandicap = (playerHandicaps: number[]) => {
  const allowances = scrambleAllowances[playerHandicaps.length];
  if (!allowances || playerHandicaps.some((value) => !Number.isFinite(value))) {
    throw new Error('Scramble handicap calculation requires two, three, or four players.');
  }
  const ordered = [...playerHandicaps].sort((left, right) => left - right);
  return rounded(
    ordered.reduce((total, handicap, index) => total + handicap * allowances[index], 0),
  );
};
