import { describe, expect, it } from 'vitest';
import { getRenewedLeagueName, shiftSeasonDate } from '../services/leagueSeasonRenewal';

describe('league season renewal', () => {
  it('moves season dates forward exactly one calendar year', () => {
    expect(shiftSeasonDate(new Date('2025-04-15T00:00:00.000Z')).toISOString()).toBe(
      '2026-04-15T00:00:00.000Z',
    );
  });

  it('moves leap day to the final day of February in a non-leap year', () => {
    expect(shiftSeasonDate(new Date('2024-02-29T00:00:00.000Z')).toISOString()).toBe(
      '2025-02-28T00:00:00.000Z',
    );
  });

  it('replaces an existing season year in the league name', () => {
    expect(getRenewedLeagueName('Tuesday League 2025', 2025, 2026)).toBe(
      'Tuesday League 2026',
    );
  });

  it('adds the next season year when the name has no year', () => {
    expect(getRenewedLeagueName('Tuesday League', 2025, 2026)).toBe('Tuesday League 2026');
  });
});
