import { describe, expect, it } from 'vitest';
import { normalizeLeagueScoringPeriods } from '../utils/league-scoring-periods';

const league = {
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2026-12-31T00:00:00.000Z'),
};

describe('league scoring periods', () => {
  it('normalizes consecutive periods into stable positions', () => {
    const periods = normalizeLeagueScoringPeriods(
      [
        { name: '1st Half', startDate: '2026-05-01', endDate: '2026-06-30' },
        { name: '2nd Half', startDate: '2026-07-01', endDate: '2026-09-01' },
      ],
      league,
    );

    expect(periods.map(({ name, position }) => ({ name, position }))).toEqual([
      { name: '1st Half', position: 1 },
      { name: '2nd Half', position: 2 },
    ]);
  });

  it('rejects gaps between periods', () => {
    expect(() =>
      normalizeLeagueScoringPeriods(
        [
          { name: '1st Half', startDate: '2026-05-01', endDate: '2026-06-30' },
          { name: '2nd Half', startDate: '2026-07-02', endDate: '2026-09-01' },
        ],
        league,
      ),
    ).toThrow(/consecutive/i);
  });
});
