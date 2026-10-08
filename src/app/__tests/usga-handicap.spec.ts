import { describe, expect, it } from 'vitest';
import { calculateHandicapIndexFromDifferentials, getHandicapRule, roundHandicap } from '../utils/usga-handicap';

describe('actual differential selection', () => {
  it('waits for three actual entries without inventing history', () => {
    expect(calculateHandicapIndexFromDifferentials([])).toBeNull();
    expect(calculateHandicapIndexFromDifferentials([4.79])).toBeNull();
    expect(calculateHandicapIndexFromDifferentials([4.79, 11])).toBeNull();
    expect(calculateHandicapIndexFromDifferentials([4.79, 11, 12])).toBe(2.79);
  });
  it.each([
    [3, 1, -2], [4, 1, -1], [5, 1, 0], [6, 2, -1], [7, 2, 0], [8, 2, 0],
    [9, 3, 0], [11, 3, 0], [12, 4, 0], [14, 4, 0], [15, 5, 0], [16, 5, 0],
    [17, 6, 0], [18, 6, 0], [19, 7, 0], [20, 8, 0],
  ])('selects the table rule for %i scores', (rounds, count, adjustment) => {
    expect(getHandicapRule(rounds)).toEqual({ count, adjustment });
    expect(getHandicapRule(rounds, 9)).toEqual({ count, adjustment: adjustment / 2 });
  });
  it('uses only the last twenty and preserves league precision', () => {
    expect(calculateHandicapIndexFromDifferentials([-20, ...Array.from({ length: 20 }, (_, index) => index + 1)])).toBe(4.5);
    expect(calculateHandicapIndexFromDifferentials([10.1, 10.2, 18, 19, 20, 21, 22])).toBe(10.15);
  });
  it('rounds decimal half-strokes consistently instead of inheriting binary floating-point errors', () => {
    expect(roundHandicap(10.075)).toBe(10.08);
    expect(roundHandicap(-10.075)).toBe(-10.07);
    expect(calculateHandicapIndexFromDifferentials([10.07, 10.08, 18, 19, 20, 21, 22])).toBe(10.08);
    expect(() => calculateHandicapIndexFromDifferentials([12, 13, NaN, 14])).toThrow('Invalid');
  });
  it('caps against an established low index only after twenty entries', () => {
    expect(calculateHandicapIndexFromDifferentials(Array(19).fill(30), { lowIndex: 10 })).toBe(30);
    expect(calculateHandicapIndexFromDifferentials(Array(20).fill(30), { lowIndex: 10 })).toBe(15);
    expect(calculateHandicapIndexFromDifferentials(Array(20).fill(15), { basis: 9, lowIndex: 5 })).toBe(7.5);
  });
});
