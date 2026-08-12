import { prisma } from '../../prisma';
import {
  BILLING_CURRENCY,
  BILLING_MIN_GOLFERS,
  BILLING_PRICE_PER_GOLFER_CENTS,
  getBillingState,
} from '../utils/billing';

const TRANSACTION_LIMIT = 250;

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const getStripeCustomerId = (metadata: unknown) => {
  const customerId = toRecord(toRecord(metadata).stripe).customerId;
  return typeof customerId === 'string' && customerId.trim() ? customerId : null;
};

const getCheckoutStatus = (quantity: number, refundedQuantity: number) => {
  if (refundedQuantity <= 0) return 'paid' as const;
  if (refundedQuantity >= quantity) return 'refunded' as const;
  return 'partially_refunded' as const;
};

export const getAdminBillingDashboard = async () => {
  const [totals, completions, billingUsers] = await Promise.all([
    prisma.stripe_checkout_completion.aggregate({
      _count: { id: true },
      _sum: { quantity: true, refundedQuantity: true },
    }),
    prisma.stripe_checkout_completion.findMany({
      orderBy: { createdAt: 'desc' },
      take: TRANSACTION_LIMIT,
    }),
    prisma.user.findMany({
      where: {
        deletedAt: null,
        role: { in: ['ADMIN', 'SUPER'], mode: 'insensitive' },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        metadata: true,
        manager: {
          where: { deletedAt: null },
          select: {
            id: true,
            numPlayers: true,
            players: {
              where: { type: 'player', deletedAt: null },
              select: { id: true },
            },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
  ]);

  const completionUserIds = [...new Set(completions.map((completion) => completion.userId))];
  const completionLeagueIds = [
    ...new Set(
      completions
        .map((completion) => completion.leagueId)
        .filter((leagueId): leagueId is number => leagueId !== null),
    ),
  ];
  const knownBillingUserIds = new Set(billingUsers.map((user) => user.id));

  const [historicalUsers, leagues] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: { in: completionUserIds.filter((userId) => !knownBillingUserIds.has(userId)) },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        metadata: true,
      },
    }),
    prisma.league.findMany({
      where: { id: { in: completionLeagueIds } },
      select: { id: true, name: true },
    }),
  ]);

  const allUsers = [...billingUsers, ...historicalUsers];
  const userById = new Map(allUsers.map((user) => [user.id, user]));
  const leagueById = new Map(leagues.map((league) => [league.id, league]));

  const accounts = billingUsers.map((user) => {
    const allocatedGolfers = user.manager.reduce(
      (total, league) =>
        total + Math.max(BILLING_MIN_GOLFERS, league.numPlayers, league.players.length),
      0,
    );
    const billing = getBillingState(user.metadata, allocatedGolfers);

    return {
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email,
      role: String(user.role).toUpperCase(),
      stripeCustomerId: getStripeCustomerId(user.metadata),
      leagueCount: user.manager.length,
      ...billing,
      capacityStatus:
        billing.allocatedGolfers > billing.includedGolfers
          ? ('over_allocated' as const)
          : billing.hasCompletedRegistration
            ? ('active' as const)
            : ('unpaid' as const),
    };
  });

  const purchasedSeats = Number(totals._sum.quantity || 0);
  const refundedSeats = Number(totals._sum.refundedQuantity || 0);
  const grossRevenueCents = purchasedSeats * BILLING_PRICE_PER_GOLFER_CENTS;
  const refundedRevenueCents = refundedSeats * BILLING_PRICE_PER_GOLFER_CENTS;

  return {
    summary: {
      completedPayments: totals._count.id,
      customerAccounts: accounts.filter((account) => account.stripeCustomerId).length,
      purchasedSeats,
      refundedSeats,
      activePaidSeats: Math.max(0, purchasedSeats - refundedSeats),
      grossRevenueCents,
      refundedRevenueCents,
      netRevenueCents: Math.max(0, grossRevenueCents - refundedRevenueCents),
      currency: BILLING_CURRENCY,
      pricePerGolferCents: BILLING_PRICE_PER_GOLFER_CENTS,
    },
    accounts,
    transactions: completions.map((completion) => {
      const user = userById.get(completion.userId);
      const league = completion.leagueId ? leagueById.get(completion.leagueId) : null;
      const refundedQuantity = Number(completion.refundedQuantity || 0);

      return {
        id: completion.id,
        sessionId: completion.sessionId,
        paymentIntentId: completion.paymentIntentId,
        purpose: completion.purpose,
        quantity: completion.quantity,
        refundedQuantity,
        targetGolfers: completion.targetGolfers,
        status: getCheckoutStatus(completion.quantity, refundedQuantity),
        grossAmountCents: completion.quantity * BILLING_PRICE_PER_GOLFER_CENTS,
        refundedAmountCents: refundedQuantity * BILLING_PRICE_PER_GOLFER_CENTS,
        netAmountCents:
          Math.max(0, completion.quantity - refundedQuantity) * BILLING_PRICE_PER_GOLFER_CENTS,
        currency: BILLING_CURRENCY,
        createdAt: completion.createdAt,
        refundedAt: completion.refundedAt,
        userId: completion.userId,
        userName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Deleted account',
        userEmail: user?.email || null,
        stripeCustomerId: user ? getStripeCustomerId(user.metadata) : null,
        leagueId: completion.leagueId,
        leagueName: league?.name || null,
      };
    }),
    transactionLimit: TRANSACTION_LIMIT,
  };
};
