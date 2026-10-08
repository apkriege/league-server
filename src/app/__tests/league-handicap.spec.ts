import { describe, expect, it } from 'vitest';
import { calculateLeagueHandicap, type HandicapRound } from '../utils/league-handicap';
import { adjustHandicapHole, normalizeHandicapSettings, parseStartingHandicap } from '../utils/handicap-settings';
import { calculateRoundDifferential } from '../utils/tee-rating';

const settings = { handicapBestRounds: 5, handicapWindow: 8 };
const rounds = (values: number[]): HandicapRound[] => values.map((differential, index) => ({
  id: index + 1, eventId: index + 1, differential, holes: 9, playedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
}));
const calculate = (values: number[], starting: number | null = null) => calculateLeagueHandicap(rounds(values), starting, 9, [], settings);

describe('configurable league handicap', () => {
  it('preserves unknown, scratch and supplied starting values without fictional rounds', () => {
    expect(calculate([])).toMatchObject({ index: null, status: 'unknown', entries: [] });
    expect(calculate([], 0)).toMatchObject({ index: 0, status: 'provisional', eligibleRounds: 0 });
    expect(calculate([9], 15)).toMatchObject({ index: 9, status: 'provisional', eligibleRounds: 1 });
  });
  it('averages all scores through X, then selects best X as the window fills and rolls', () => {
    const values = [9, 11, 8, 13, 10, 12, 7, 14, 16];
    expect(values.map((_, index) => calculate(values.slice(0, index + 1)).index)).toEqual([9, 10, 9.33, 10.25, 10.2, 10, 9, 9, 9.6]);
    expect(calculate(values).entries.map((entry) => entry.roundIds[0])).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(calculate(values).usedEntries.map((entry) => entry.differential)).toEqual([7, 8, 10, 11, 12]);
  });
  it('counts all actual history beyond the window and returns to provisional after removal', () => {
    expect(calculate(Array(30).fill(9))).toMatchObject({ eligibleRounds: 30, index: 9 });
    expect(calculate([9, 11, 8])).toMatchObject({ eligibleRounds: 3, status: 'provisional', index: 9.33 });
    expect(calculate([], 12).index).toBe(12);
  });
  it('uses a rolling average when X equals Y and supports the maximum window', () => {
    const result = calculateLeagueHandicap(rounds([4, 8, 12, 16, 20]), null, 9, [], { handicapBestRounds: 4, handicapWindow: 4 });
    expect(result.index).toBe(14);
    expect(calculateLeagueHandicap(rounds(Array(21).fill(12)), null, 9, [], { handicapBestRounds: 20, handicapWindow: 20 })).toMatchObject({ index: 12, eligibleRounds: 21 });
  });
  it('multiplies the selected average once before rounding and applying the maximum', () => {
    const modified = { ...settings, handicapMultiplier: 0.96 };
    expect(calculateLeagueHandicap(rounds([9]), null, 9, [], modified)).toMatchObject({ index: 8.64, average: 9, multiplier: 0.96 });
    expect(calculateLeagueHandicap(rounds([9, 12, 6]), null, 9, [], modified).index).toBe(8.64);
    expect(calculateLeagueHandicap(rounds([9, 12, 6, 8, 10, 20]), null, 9, [], modified).index).toBe(8.64);
    expect(calculateLeagueHandicap(rounds([28]), null, 9, [], modified).index).toBe(26.88);
    expect(calculateLeagueHandicap(rounds([-2]), null, 9, [], modified).index).toBe(-1.92);
    expect(calculateLeagueHandicap([], 9, 9, [], modified).index).toBe(9);
    expect(calculateLeagueHandicap(rounds([9]), null, 9, [{handicap:7,effectiveAt:'2026-02-01'}], modified).index).toBe(7);
  });
  it('orders same-date history by event and round identity, including selection ties', () => {
    const history = rounds([10, 10, 10, 10, 10, 10]);
    history.forEach((round) => { round.playedAt = history[0].playedAt; });
    const result = calculateLeagueHandicap([...history].reverse(), null, 9, [], settings);
    expect(result.usedEntries.map((entry) => entry.roundIds[0])).toEqual([1, 2, 3, 4, 5]);
    expect(result).toEqual(calculateLeagueHandicap(history, null, 9, [], settings));
  });
  it('supports plus handicaps and maximum bounds without caps or performance reductions', () => {
    expect(calculate([-2, -1]).index).toBe(-1.5);
    expect(calculate([40]).index).toBe(27);
    expect(calculateLeagueHandicap(rounds(Array(30).fill(40)), 5, 18, [], settings).index).toBe(40);
    expect(calculate([9, 9, 9, 9, 9, 0]).index).toBe(7.2);
  });
  it('preserves legacy corrections until the next actual round resumes calculation', () => {
    const adjustment = { handicap: 7, effectiveAt: '2026-01-02T12:00:00Z' };
    expect(calculateLeagueHandicap(rounds([9, 11]), 12, 9, [adjustment], settings)).toMatchObject({ index: 7, status: 'manual' });
    expect(calculateLeagueHandicap(rounds([9, 11, 8]), 12, 9, [adjustment], settings).index).toBe(9.33);
  });
  it('resumes calculation for a round starting exactly when a correction takes effect', () => {
    const history = rounds([9]);
    expect(calculateLeagueHandicap(history, 12, 9, [{ handicap: 7, effectiveAt: history[0].playedAt }], settings)).toMatchObject({ index: 9, status: 'provisional' });
  });
  it('rejects duplicate rounds, invalid scores and invalid dates', () => {
    const history = rounds([9]);
    expect(() => calculateLeagueHandicap([...history, ...history], null, 9)).toThrow();
    expect(() => calculate([NaN])).toThrow();
    expect(() => calculateLeagueHandicap([{ ...history[0], playedAt: 'bad' }], null, 9)).toThrow();
  });
});

describe('handicap settings and adjusted scores', () => {
  it.each([0, -1, 1.01, NaN, Infinity, '', true, null])('rejects invalid multiplier %s', (handicapMultiplier) => {
    expect(() => normalizeHandicapSettings({handicapMultiplier})).toThrow('multiplier');
  });
  it('defaults to an unchanged handicap and accepts a decimal multiplier', () => {
    expect(normalizeHandicapSettings({}).handicapMultiplier).toBe(1);
    expect(normalizeHandicapSettings({handicapMultiplier:'0.96'}).handicapMultiplier).toBe(0.96);
  });
  it.each([[3, 8], [6, 5], [6, 21], [4.5, 8]])('rejects invalid X=%s Y=%s', (x, y) => {
    expect(() => normalizeHandicapSettings({ handicapBestRounds: x, handicapWindow: y })).toThrow();
  });
  it('keeps zero distinct from unknown and validates external starting values', () => {
    expect(parseStartingHandicap('')).toBeNull();
    expect(parseStartingHandicap(null)).toBeNull();
    expect(parseStartingHandicap('0')).toBe(0);
    expect(parseStartingHandicap('-2')).toBe(-2);
    for (const invalid of ['bad', 55, -11, true, [], {}]) expect(() => parseStartingHandicap(invalid)).toThrow();
  });
  it('applies each admin limit and uses a non-circular fallback for unknown handicaps', () => {
    for (const extra of [1, 2, 3, 4, 5] as const) expect(adjustHandicapHole(12, 4, 2, 18, `par-plus-${extra}`)).toBe(4 + extra);
    expect(adjustHandicapHole(12, 4, 2, 18, 'handicap-adjusted')).toBe(8);
    expect(adjustHandicapHole(12, 4, 0, null, 'handicap-adjusted')).toBe(9);
    expect(adjustHandicapHole(12, 4, 2, 18, 'none')).toBe(12);
    expect(adjustHandicapHole(3, 4, 2, 18, 'par-plus-1')).toBe(3);
  });
  it('normalizes real rounds in both directions using the actual tee ratings', () => {
    expect(calculateRoundDifferential(45, { rating: 36, slope: 113, holesPlayed: 9 }, null, 9)).toBe(9);
    expect(calculateRoundDifferential(45, { rating: 36, slope: 113, holesPlayed: 9 }, null, 18)).toBe(18);
    expect(calculateRoundDifferential(90, { rating: 72, slope: 113, holesPlayed: 18 }, null, 9)).toBe(9);
    expect(calculateRoundDifferential(45, { rating: 36, slope: 125, holesPlayed: 9 }, null, 9)).toBe(8.14);
  });
});
