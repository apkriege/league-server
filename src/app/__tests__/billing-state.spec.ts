import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

vi.mock('../../prisma', () => ({
  prisma: { league_season_entitlement: { findMany: findManyMock } },
}));

import {
  BILLING_MIN_GOLFERS,
  getAllocatedGolfersForAdmin,
  getBillingState,
  getLeagueCapacityPurchase,
  getLeagueBillableGolfers,
} from '../utils/billing';

describe('league billing', () => {
  beforeEach(() => findManyMock.mockReset());

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

  it('does not recharge previously purchased capacity after a roster reduction', () => {
    expect(getLeagueCapacityPurchase(8, 24, 16)).toEqual({
      targetGolfers: 16,
      quantity: 0,
    });
    expect(getLeagueCapacityPurchase(16, 24, 26)).toEqual({
      targetGolfers: 26,
      quantity: 2,
    });
  });

  it('permanently allocates paid capacity to every league season', async () => {
    findManyMock.mockResolvedValue([
      { requiredGolfers: 8 },
      { requiredGolfers: 10 },
    ]);

    await expect(getAllocatedGolfersForAdmin(7)).resolves.toBe(18);
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          billingOwnerId: 7,
          league: { is: { billingExempt: false } },
        },
      }),
    );
  });

  it('does not honor legacy account-wide payment exemption metadata', () => {
    const billing = getBillingState({ billing: { includedGolfers: 0, paymentExempt: true } }, 24);
    expect(billing.hasCompletedRegistration).toBe(false);
    expect(billing.paymentExempt).toBe(false);
  });
});
