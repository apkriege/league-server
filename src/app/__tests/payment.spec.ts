import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.STRIPE_SECRET_KEY = 'sk_test_unit_test_only';

const mockTx: any = {
  $queryRaw: vi.fn(),
  stripe_checkout_completion: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  league: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  player: {
    count: vi.fn(),
  },
  league_season_entitlement: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};
const transactionMock = vi.fn(async (callback: any) => callback(mockTx));

vi.mock('../../prisma', () => ({
  prisma: {
    $transaction: transactionMock,
    user: { findFirst: vi.fn() },
  },
}));

const session = {
  id: 'cs_paid_once',
  client_reference_id: '7',
  payment_status: 'paid',
  status: 'complete',
  customer: 'cus_1',
  payment_intent: 'pi_1',
  metadata: {
    purpose: 'seat_upgrade',
    quantity: '2',
    targetGolfers: '12',
  },
} as any;

describe('Stripe checkout completion', async () => {
  const {
    applyCompletedCheckoutSession,
    applyRefundedCharge,
    getCheckoutConfirmationStatus,
    withCheckoutSessionId,
  } = await import('../controllers/payment');

  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.user.findFirst.mockResolvedValue({
      id: 7,
      metadata: { billing: { includedGolfers: 10 }, stripe: {} },
    });
    mockTx.user.findUnique.mockResolvedValue({
      id: 7,
      metadata: { billing: { includedGolfers: 10 }, stripe: {} },
    });
    mockTx.user.update.mockImplementation(async ({ data }: any) => ({ id: 7, ...data }));
    mockTx.stripe_checkout_completion.create.mockResolvedValue({});
    mockTx.league_season_entitlement.findFirst.mockResolvedValue(null);
    mockTx.league_season_entitlement.findUnique.mockResolvedValue(null);
  });

  it('adds paid seats and records the unique session in the same transaction', async () => {
    mockTx.stripe_checkout_completion.findUnique.mockResolvedValue(null);

    const result = await applyCompletedCheckoutSession(session);

    expect(result?.id).toBe(7);
    expect(mockTx.user.update).toHaveBeenCalledTimes(1);
    expect(mockTx.user.update.mock.calls[0][0].data.metadata.billing.includedGolfers).toBe(12);
    expect(mockTx.stripe_checkout_completion.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'cs_paid_once',
        paymentIntentId: 'pi_1',
        userId: 7,
        leagueId: null,
        entitlementId: null,
        purpose: 'seat_upgrade',
        quantity: 2,
        targetGolfers: 12,
      },
    });
    expect(transactionMock.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
  });

  it('does not add seats again when Stripe replays the same session', async () => {
    mockTx.stripe_checkout_completion.findUnique.mockResolvedValue({ id: 1 });

    await applyCompletedCheckoutSession(session);

    expect(mockTx.user.update).not.toHaveBeenCalled();
    expect(mockTx.stripe_checkout_completion.create).not.toHaveBeenCalled();
  });

  it('applies an additional-player payment only to its league capacity', async () => {
    mockTx.stripe_checkout_completion.findUnique.mockResolvedValue(null);
    mockTx.league.findFirst.mockResolvedValue({ id: 3, numPlayers: 8, billingPaidGolfers: 8 });
    mockTx.league.update.mockResolvedValue({ id: 3, numPlayers: 9, billingPaidGolfers: 9 });
    mockTx.league_season_entitlement.findUnique.mockResolvedValue({
      id: 21,
      billingOwnerId: 7,
      requiredGolfers: 8,
      paidGolfers: 8,
      refundedGolfers: 0,
      league: { id: 3 },
    });
    mockTx.league_season_entitlement.update.mockResolvedValue({
      id: 21,
      requiredGolfers: 8,
      paidGolfers: 9,
      refundedGolfers: 0,
    });

    await applyCompletedCheckoutSession({
      ...session,
      id: 'cs_league_capacity',
      metadata: {
        purpose: 'league_capacity',
        quantity: '1',
        targetGolfers: '9',
        leagueId: '3',
        entitlementId: '21',
      },
    });

    expect(mockTx.league.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { numPlayers: 9, billingPaidGolfers: 9, billingStatus: 'active' },
    });
    expect(mockTx.league_season_entitlement.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: {
        paidGolfers: { increment: 1 },
        requiredGolfers: 9,
        status: 'consumed',
      },
    });
    expect(mockTx.user.update.mock.calls[0][0].data.metadata.billing.includedGolfers).toBe(11);
    expect(mockTx.stripe_checkout_completion.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'cs_league_capacity',
        paymentIntentId: 'pi_1',
        userId: 7,
        leagueId: 3,
        entitlementId: 21,
        purpose: 'league_capacity',
        quantity: 1,
        targetGolfers: 9,
      },
    });
  });

  it('does not grant seats for a completed but unpaid checkout', async () => {
    await applyCompletedCheckoutSession({
      ...session,
      id: 'cs_unpaid',
      payment_status: 'unpaid',
      status: 'complete',
    });

    expect(transactionMock).not.toHaveBeenCalled();
    expect(mockTx.user.update).not.toHaveBeenCalled();
  });

  it('adds the Stripe session placeholder before a URL fragment', () => {
    expect(withCheckoutSessionId('https://app.example.com/leagues?checkout=success#review')).toBe(
      'https://app.example.com/leagues?checkout=success&session_id={CHECKOUT_SESSION_ID}#review',
    );
  });

  it('classifies paid, processing, and failed checkout returns', () => {
    expect(getCheckoutConfirmationStatus(session)).toBe('succeeded');
    expect(
      getCheckoutConfirmationStatus({
        ...session,
        payment_status: 'unpaid',
        payment_intent: { status: 'processing' },
      }),
    ).toBe('processing');
    expect(
      getCheckoutConfirmationStatus({
        ...session,
        payment_status: 'unpaid',
        payment_intent: { status: 'requires_payment_method' },
      }),
    ).toBe('failed');
  });

  it('revokes refunded league capacity once without removing active golfers', async () => {
    mockTx.stripe_checkout_completion.findUnique.mockResolvedValue({
      id: 12,
      userId: 7,
      leagueId: 3,
      purpose: 'league_capacity',
      quantity: 2,
      refundedQuantity: 0,
      entitlementId: 21,
    });
    mockTx.league.findFirst.mockResolvedValue({
      id: 3,
      numPlayers: 10,
      billingPaidGolfers: 10,
    });
    mockTx.player.count.mockResolvedValue(9);
    mockTx.league_season_entitlement.findUnique.mockResolvedValue({
      id: 21,
      requiredGolfers: 10,
      paidGolfers: 10,
      refundedGolfers: 0,
      league: { id: 3 },
    });
    mockTx.league_season_entitlement.update.mockResolvedValue({
      id: 21,
      requiredGolfers: 10,
      paidGolfers: 10,
      refundedGolfers: 2,
      status: 'partially_refunded',
    });
    mockTx.stripe_checkout_completion.update.mockResolvedValue({ id: 12 });

    await applyRefundedCharge({
      payment_intent: 'pi_1',
      amount_refunded: 2000,
      refunded: true,
    } as any);

    expect(mockTx.user.update.mock.calls[0][0].data.metadata.billing.includedGolfers).toBe(8);
    expect(mockTx.league.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { numPlayers: 9, billingPaidGolfers: 8, billingStatus: 'payment_due' },
    });
    expect(mockTx.league_season_entitlement.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: {
        refundedGolfers: 2,
        status: 'partially_refunded',
      },
    });
    expect(mockTx.stripe_checkout_completion.update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: {
        refundedQuantity: 2,
        refundedAt: expect.any(Date),
      },
    });
  });
});
