import { describe, expect, it } from 'vitest';
import { getFlightStartsAt } from '../services/flightGen';

describe('getFlightStartsAt', () => {
  it('stores generated flight times as UTC instants', () => {
    const eventStartsAt = '2026-08-01T12:50:00.000Z';
    expect(getFlightStartsAt(eventStartsAt, 10, 0).toISOString()).toBe(eventStartsAt);
    expect(getFlightStartsAt(eventStartsAt, 10, 1).toISOString()).toBe(
      '2026-08-01T13:00:00.000Z',
    );
    expect(getFlightStartsAt(eventStartsAt, 10, 7).toISOString()).toBe(
      '2026-08-01T14:00:00.000Z',
    );
  });
});
