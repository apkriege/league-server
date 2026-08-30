import { describe, expect, it } from 'vitest';
import { validateFlightConfiguration } from '../services/flightGen';

const league = {
  players: [1, 2, 3, 4, 5].map((id) => ({ id })),
  teams: [
    { id: 11, players: [{ id: 1 }, { id: 2 }] },
    { id: 12, players: [{ id: 3 }, { id: 4 }] },
  ],
};

describe('event flight validation', () => {
  it('accepts valid individual stroke and match flights', () => {
    expect(() =>
      validateFlightConfiguration(league, {
        format: 'individual',
        scoringMode: 'stroke-play',
        flights: [[1, 2, 3, 4], [5]],
      }),
    ).not.toThrow();
    expect(() =>
      validateFlightConfiguration(league, {
        format: 'individual',
        scoringMode: 'match-play',
        flights: [[[1, 2], [3, 4]]],
      }),
    ).not.toThrow();
  });

  it('rejects foreign and duplicate player assignments', () => {
    expect(() =>
      validateFlightConfiguration(league, {
        format: 'individual',
        scoringMode: 'stroke-play',
        flights: [[1, 999]],
      }),
    ).toThrow(/does not belong/i);
    expect(() =>
      validateFlightConfiguration(league, {
        format: 'individual',
        scoringMode: 'match-play',
        flights: [[[1, 2]], [[1, 3]]],
      }),
    ).toThrow(/more than one flight/i);
  });

  it('requires resolvable, unique teams with sufficient rosters', () => {
    expect(() =>
      validateFlightConfiguration(league, {
        format: 'team',
        scoringMode: 'match-play',
        flights: [[11, 12]],
      }),
    ).not.toThrow();
    expect(() =>
      validateFlightConfiguration(league, {
        format: 'team',
        scoringMode: 'stroke-play',
        flights: [[11, 99]],
      }),
    ).toThrow(/resolve team ids/i);
  });
});
