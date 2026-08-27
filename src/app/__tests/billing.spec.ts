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
  isValidPaymentBypassCode,
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
      expect.objectContaining({ where: { adminId: 7, deletedAt: null } }),
    );
  });

  it('treats a redeemed payment access code as covering registration and all capacity', () => {
    const billing = getBillingState({ billing: { includedGolfers: 0, paymentExempt: true } }, 24);

    expect(billing.hasCompletedRegistration).toBe(true);
    expect(billing.paymentExempt).toBe(true);
    expect(isBillingCapacityCovered(billing, 10000)).toBe(true);
  });

  it('validates configured payment access codes without case or surrounding whitespace', () => {
    const originalCodes = process.env.PAYMENT_BYPASS_CODES;
    process.env.PAYMENT_BYPASS_CODES = 'LEAGUE-COMP-2026,PARTNER-ACCESS-42';
    try {
      expect(isValidPaymentBypassCode(' league-comp-2026 ')).toBe(true);
      expect(isValidPaymentBypassCode('not-a-real-code')).toBe(false);
    } finally {
      if (originalCodes === undefined) delete process.env.PAYMENT_BYPASS_CODES;
      else process.env.PAYMENT_BYPASS_CODES = originalCodes;
    }
  });
});
