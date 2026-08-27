import { describe, expect, it } from 'vitest';
import {
  calculateExpectedNineHoleDifferential,
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
};

describe('nine-hole handicap differentials', () => {
  it('keeps a nine-hole league differential on the nine-hole scale', () => {
    expect(calculateRoundDifferential(36, nineHoleTee, 12, 9)).toBe(0);
  });

  it('adds an expected nine-hole differential for an 18-hole index', () => {
    expect(calculateExpectedNineHoleDifferential(12)).toBe(7.5);
    expect(calculateRoundDifferential(36, nineHoleTee, 12, 18)).toBe(7.5);
  });
});
