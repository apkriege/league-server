import { describe, expect, it } from 'vitest';
import { calculateHandicapIndexFromDifferentials } from '../utils/usga-handicap';

describe('calculateHandicapIndexFromDifferentials', () => {
  it('keeps the existing index until three differentials exist', () => {
    expect(calculateHandicapIndexFromDifferentials([10, 12])).toBeNull();
  });

  it('uses the early-round adjustment table', () => {
    expect(calculateHandicapIndexFromDifferentials([12, 15, 18])).toBe(10);
    expect(calculateHandicapIndexFromDifferentials([12, 15, 18, 20])).toBe(11);
    expect(calculateHandicapIndexFromDifferentials([12, 15, 18, 20, 22])).toBe(12);
  });

  it('uses the lowest eight of the latest twenty differentials', () => {
    const staleLowDifferential = -20;
    const latestTwenty = Array.from({ length: 20 }, (_, index) => index + 1);

    expect(
      calculateHandicapIndexFromDifferentials([staleLowDifferential, ...latestTwenty]),
    ).toBe(4.5);
  });

  it('applies the configured increase caps against the previous index', () => {
    expect(calculateHandicapIndexFromDifferentials(Array(20).fill(30), 10)).toBe(15);
  });
});
