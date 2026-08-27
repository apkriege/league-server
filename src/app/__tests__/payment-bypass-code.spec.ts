import { beforeEach, describe, expect, it, vi } from 'vitest';

const { transactionMock, txMock } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    league_season_entitlement: { findMany: vi.fn() },
    payment_bypass_code: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    txMock: tx,
    transactionMock: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };
});

vi.mock('../../prisma', () => ({
  prisma: { $transaction: transactionMock },
}));

import {
  attachPendingPaymentBypassToLeague,
  generatePaymentBypassCode,
  getPaymentBypassCodeStatus,
  hashPaymentBypassCode,
  redeemPaymentBypassCode,
} from '../services/paymentBypassCode';

describe('one-time payment access codes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txMock.league_season_entitlement.findMany.mockResolvedValue([]);
  });

  it('generates a customer-friendly high-entropy code and hashes normalized input', () => {
    const code = generatePaymentBypassCode();
    expect(code).toMatch(/^COMP-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(hashPaymentBypassCode(` ${code.toLowerCase()} `)).toBe(hashPaymentBypassCode(code));
    expect(hashPaymentBypassCode(code)).not.toContain(code);
  });

  it('marks used, revoked, and expired codes as unavailable', () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);
    expect(getPaymentBypassCodeStatus({ redeemedAt: null, revokedAt: null, expiresAt: future })).toBe('active');
    expect(getPaymentBypassCodeStatus({ redeemedAt: new Date(), revokedAt: null, expiresAt: future })).toBe('redeemed');
    expect(getPaymentBypassCodeStatus({ redeemedAt: null, revokedAt: new Date(), expiresAt: future })).toBe('revoked');
    expect(getPaymentBypassCodeStatus({ redeemedAt: null, revokedAt: null, expiresAt: past })).toBe('expired');
  });

  it('does not accept another active code while a one-league bypass is pending', async () => {
    txMock.payment_bypass_code.findUnique.mockResolvedValue({
      id: 12,
      redeemedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    txMock.user.findFirst.mockResolvedValue({
      id: 7,
      metadata: { billing: { pendingLeagueBypassCodeId: 11 } },
    });

    await expect(redeemPaymentBypassCode(7, 'COMP-AAAA-BBBB-CCCC')).resolves.toBeNull();

    expect(txMock.payment_bypass_code.updateMany).not.toHaveBeenCalled();
    expect(txMock.user.update).not.toHaveBeenCalled();
  });

  it('creates a pending one-league bypass without exempting the account', async () => {
    txMock.payment_bypass_code.findUnique.mockResolvedValue({
      id: 12,
      redeemedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    txMock.user.findFirst.mockResolvedValue({ id: 7, metadata: {} });
    txMock.payment_bypass_code.updateMany.mockResolvedValue({ count: 1 });
    txMock.user.update.mockResolvedValue({
      metadata: { billing: { pendingLeagueBypassCodeId: 12 } },
    });

    const billing = await redeemPaymentBypassCode(7, 'COMP-AAAA-BBBB-CCCC');

    expect(billing).toMatchObject({
      hasPendingLeagueBypass: true,
      paymentExempt: false,
    });
    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        metadata: {
          billing: {
            pendingLeagueBypassCodeId: 12,
            pendingLeagueBypassRedeemedAt: expect.any(String),
          },
        },
      },
      select: { metadata: true },
    });
  });

  it('rejects a code when another redemption has already claimed it', async () => {
    txMock.payment_bypass_code.findUnique.mockResolvedValue({
      id: 12,
      redeemedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    txMock.user.findFirst.mockResolvedValue({ id: 7, metadata: {} });
    txMock.payment_bypass_code.updateMany.mockResolvedValue({ count: 0 });

    await expect(redeemPaymentBypassCode(7, 'COMP-AAAA-BBBB-CCCC')).resolves.toBeNull();

    expect(txMock.payment_bypass_code.updateMany).toHaveBeenCalledTimes(1);
    expect(txMock.user.update).not.toHaveBeenCalled();
  });

  it('attaches the redeemed code to one league and clears the pending entitlement', async () => {
    txMock.payment_bypass_code.updateMany.mockResolvedValue({ count: 1 });

    const attached = await attachPendingPaymentBypassToLeague(
      txMock as Parameters<typeof attachPendingPaymentBypassToLeague>[0],
      {
        userId: 7,
        leagueId: 42,
        userMetadata: {
          billing: {
            includedGolfers: 0,
            pendingLeagueBypassCodeId: 12,
            pendingLeagueBypassRedeemedAt: '2026-08-26T12:00:00.000Z',
          },
        },
      },
    );

    expect(attached).toBe(true);
    expect(txMock.payment_bypass_code.updateMany).toHaveBeenCalledWith({
      where: {
        id: 12,
        redeemedById: 7,
        redeemedAt: { not: null },
        redeemedLeagueId: null,
        revokedAt: null,
      },
      data: { redeemedLeagueId: 42 },
    });
    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        metadata: {
          billing: {
            includedGolfers: 0,
            pendingLeagueBypassCodeId: null,
            pendingLeagueBypassRedeemedAt: null,
          },
        },
      },
    });
  });
});
