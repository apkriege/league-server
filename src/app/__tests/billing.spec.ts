import { describe, expect, it } from 'vitest';
import { BILLING_MIN_GOLFERS, getLeagueBillableGolfers } from '../utils/billing';

describe('league billing', () => {
  it('charges every league for the eight-golfer minimum', () => {
    expect(getLeagueBillableGolfers([])).toBe(BILLING_MIN_GOLFERS);
    expect(
      getLeagueBillableGolfers([
        { type: 'player' },
        { type: 'player' },
        { type: 'substitute' },
      ]),
    ).toBe(BILLING_MIN_GOLFERS);
  });

  it('only increases above the minimum for regular players', () => {
    const regularPlayers = Array.from({ length: 10 }, () => ({ type: 'player' }));
    expect(
      getLeagueBillableGolfers([
        ...regularPlayers,
        { type: 'sub' },
        { type: 'substitute' },
        { type: 'captain' },
      ]),
    ).toBe(10);
  });
});
