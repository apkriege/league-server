import { prisma } from '../../prisma';

export const BILLING_MIN_GOLFERS = Math.max(1, Number(process.env.BILLING_MIN_GOLFERS || 8));
export const BILLING_PRICE_PER_GOLFER_CENTS = Math.max(
  0,
  Number(process.env.BILLING_PRICE_PER_GOLFER_CENTS || 1000)
);
export const BILLING_CURRENCY = String(process.env.BILLING_CURRENCY || 'usd').toLowerCase();

export type BillingState = {
  minimumGolfers: number;
  pricePerGolferCents: number;
  currency: string;
  includedGolfers: number;
  allocatedGolfers: number;
  availableGolfers: number;
  hasCompletedRegistration: boolean;
};

const toObject = (value: unknown) => (value && typeof value === 'object' ? value : {});

export const getBillingMetadata = (metadata: unknown) => {
  const root = toObject(metadata) as Record<string, any>;
  return toObject(root.billing) as Record<string, any>;
};

export const getIncludedGolfers = (metadata: unknown) => {
  const billing = getBillingMetadata(metadata);
  return Math.max(0, Number(billing.includedGolfers || 0));
};

export const getBillingState = (
  metadata: unknown,
  allocatedGolfers = 0,
  overrides: Partial<Pick<BillingState, 'includedGolfers' | 'allocatedGolfers'>> = {}
): BillingState => {
  const includedGolfers = overrides.includedGolfers ?? getIncludedGolfers(metadata);
  const resolvedAllocatedGolfers = overrides.allocatedGolfers ?? allocatedGolfers ?? 0;
  const safeAllocatedGolfers = Math.max(0, Number(resolvedAllocatedGolfers));

  return {
    minimumGolfers: BILLING_MIN_GOLFERS,
    pricePerGolferCents: BILLING_PRICE_PER_GOLFER_CENTS,
    currency: BILLING_CURRENCY,
    includedGolfers,
    allocatedGolfers: safeAllocatedGolfers,
    availableGolfers: Math.max(0, includedGolfers - safeAllocatedGolfers),
    hasCompletedRegistration: includedGolfers >= BILLING_MIN_GOLFERS,
  };
};

export const mergeBillingMetadata = (metadata: unknown, billingPatch: Record<string, unknown>) => {
  const root = toObject(metadata) as Record<string, any>;
  const billing = getBillingMetadata(metadata);

  return {
    ...root,
    billing: {
      ...billing,
      ...billingPatch,
    },
  };
};

export const getAllocatedGolfersForAdmin = async (adminId: number, excludeLeagueId?: number) => {
  const aggregate = await prisma.league.aggregate({
    where: {
      adminId,
      deletedAt: null,
      ...(excludeLeagueId ? { id: { not: excludeLeagueId } } : {}),
    },
    _sum: {
      numPlayers: true,
    },
  });

  return Math.max(0, Number(aggregate._sum.numPlayers || 0));
};
