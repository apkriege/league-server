import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

vi.mock('../../prisma', () => ({
  prisma: { league: { findMany: findManyMock } },
}));

import {
  BILLING_MIN_GOLFERS,
  getAllocatedGolfersForAdmin,
  getBillingState,
  getLeagueBillableGolfers,
  isBillingCapacityCovered,
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

  it('only allocates capacity from active leagues', async () => {
    findManyMock.mockResolvedValue([
      { numPlayers: 8, players: [] },
      { numPlayers: 10, players: [] },
    ]);

    await expect(getAllocatedGolfersForAdmin(7)).resolves.toBe(18);
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { adminId: 7, billingExempt: false, deletedAt: null },
      }),
    );
  });

  it('does not honor legacy account-wide payment exemption metadata', () => {
    const billing = getBillingState({ billing: { includedGolfers: 0, paymentExempt: true } }, 24);
    expect(billing.hasCompletedRegistration).toBe(false);
    expect(billing.paymentExempt).toBe(false);
    expect(isBillingCapacityCovered(billing, 10000)).toBe(false);
  });
});
