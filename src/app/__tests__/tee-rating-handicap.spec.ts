import { describe, expect, it } from 'vitest';
import {
  calculateRoundDifferential,
  type RoundTee,
} from '../utils/tee-rating';

const nineHoleTee: RoundTee = {
  slope: 113,
  rating: 36,
  par: 36,
  holes: Array.from({ length: 9 }, (_, index) => ({
    num: index + 1,
    par: 4,
    hcp: index + 1,
  })),
  holesPlayed: 9,
  gender: 'male',
  side: 'front',
  isNineHoleCourse: true,
  isRepeatedNine: false,
};

describe('nine-hole handicap differentials', () => {
  it('keeps a nine-hole league differential on the nine-hole scale', () => {
    expect(calculateRoundDifferential(36, nineHoleTee, 12, 9)).toBe(0);
  });

  it('normalizes an actual nine-hole differential to an eighteen-hole league', () => {
    expect(calculateRoundDifferential(36, nineHoleTee, 12, 18)).toBe(0);
    expect(calculateRoundDifferential(40, nineHoleTee, 30, 18)).toBe(8);
  });
});
