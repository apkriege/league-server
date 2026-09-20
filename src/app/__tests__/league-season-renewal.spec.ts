import { describe, expect, it } from 'vitest';
import {
  canCreateNextSeason,
  getRenewedLeagueName,
  shiftSeasonDate,
} from '../services/leagueSeasonRenewal';

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

  it('allows renewal after the end date', () => {
    expect(
      canCreateNextSeason(
        { endDate: new Date('2026-06-14T00:00:00.000Z'), events: [] },
        new Date('2026-06-15T12:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('allows renewal when all playable events are complete', () => {
    expect(
      canCreateNextSeason(
        {
          endDate: new Date('2026-12-31T00:00:00.000Z'),
          events: [
            { status: 'completed', type: 'regular' },
            { status: 'completed', type: 'regular' },
            { status: 'canceled', type: 'regular' },
            { status: 'upcoming', type: 'off' },
          ],
        },
        new Date('2026-06-15T12:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('blocks renewal when no events exist or a playable event remains incomplete', () => {
    const futureSeason = { endDate: new Date('2026-12-31T00:00:00.000Z') };
    const now = new Date('2026-06-15T12:00:00.000Z');

    expect(canCreateNextSeason({ ...futureSeason, events: [] }, now)).toBe(false);
    expect(
      canCreateNextSeason(
        {
          ...futureSeason,
          events: [
            { status: 'completed', type: 'regular' },
            { status: 'upcoming', type: 'regular' },
          ],
        },
        now,
      ),
    ).toBe(false);
  });
});
