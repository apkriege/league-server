import { describe, expect, it } from 'vitest';
import { calculateHandicapIndexFromDifferentials } from '../utils/usga-handicap';

describe('calculateHandicapIndexFromDifferentials', () => {
  it('recalculates from the best available differential after every round', () => {
    expect(calculateHandicapIndexFromDifferentials([14])).toBe(12);
    expect(calculateHandicapIndexFromDifferentials([14, 18])).toBe(12);
  });

  it('uses the starting index as modeled history instead of replacing it after one round', () => {
    expect(calculateHandicapIndexFromDifferentials([0], 12, 12)).toBe(10.5);
    expect(calculateHandicapIndexFromDifferentials([0, 0], 10.5, 12)).toBe(9);
  });

  it('moves an established index gradually as league rounds replace modeled history', () => {
    const startingIndex = 12;
    const differentials = [8, 8, 8];
    let currentIndex = startingIndex;
    const progression = differentials.map((_, index) => {
      currentIndex =
        calculateHandicapIndexFromDifferentials(
          differentials.slice(0, index + 1),
          currentIndex,
          startingIndex,
        ) ?? currentIndex;
      return currentIndex;
    });

    expect(progression).toEqual([11.5, 11, 10.5]);
  });

  it('does not raise an established index because of a single high differential', () => {
    expect(calculateHandicapIndexFromDifferentials([24], 12, 12)).toBe(12);
  });

  it('uses the early-round adjustment table', () => {
    expect(calculateHandicapIndexFromDifferentials([12, 15, 18])).toBe(10);
    expect(calculateHandicapIndexFromDifferentials([12, 15, 18, 20])).toBe(11);
    expect(calculateHandicapIndexFromDifferentials([12, 15, 18, 20, 22])).toBe(12);
    expect(calculateHandicapIndexFromDifferentials([10, 12, 18, 19, 20, 21])).toBe(10);
  });

  it('preserves handicap precision to the hundredths place', () => {
    expect(calculateHandicapIndexFromDifferentials([10.1, 10.2, 18, 19, 20, 21, 22])).toBe(
      10.15,
    );
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
