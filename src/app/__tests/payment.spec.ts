import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.STRIPE_SECRET_KEY = 'sk_test_unit_test_only';

const mockTx: any = {
  stripe_checkout_completion: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  user: {
    findFirst: vi.fn(),
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
  const { applyCompletedCheckoutSession } = await import('../controllers/payment');

  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.user.findFirst.mockResolvedValue({
      id: 7,
      metadata: { billing: { includedGolfers: 10 }, stripe: {} },
    });
    mockTx.user.update.mockImplementation(async ({ data }: any) => ({ id: 7, ...data }));
    mockTx.stripe_checkout_completion.create.mockResolvedValue({});
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
        userId: 7,
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
});
