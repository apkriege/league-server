import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';

export const SEASON_ENTITLEMENT_STATUSES = {
  pendingPayment: 'pending_payment',
  paid: 'paid',
  consumed: 'consumed',
  partiallyRefunded: 'partially_refunded',
  refunded: 'refunded',
  bypassed: 'bypassed',
} as const;

export const leagueEntitlementStateSelect = {
  requiredGolfers: true,
  paidGolfers: true,
  refundedGolfers: true,
  status: true,
} as const;

export const normalizeBillingDraftKey = (value: unknown) => {
  const draftKey = String(value || '').trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{15,127}$/.test(draftKey) ? draftKey : null;
};

export const getNetPaidGolfers = (entitlement: {
  paidGolfers: number;
  refundedGolfers: number;
}) => Math.max(0, entitlement.paidGolfers - entitlement.refundedGolfers);

export type LeagueEntitlementState = {
  requiredGolfers: number;
  paidGolfers: number;
  refundedGolfers: number;
  status: string;
};

export const getLeagueCapacity = (league: { entitlement?: LeagueEntitlementState | null }) =>
  Math.max(0, Number(league.entitlement?.requiredGolfers || 0));

export const getLeaguePaidGolfers = (league: { entitlement?: LeagueEntitlementState | null }) =>
  league.entitlement ? getNetPaidGolfers(league.entitlement) : 0;

export const isLeagueBillingExempt = (league: { entitlement?: LeagueEntitlementState | null }) =>
  league.entitlement?.status === SEASON_ENTITLEMENT_STATUSES.bypassed;

export const getLeagueBillingStatus = (league: {
  entitlement?: LeagueEntitlementState | null;
}) => {
  if (!league.entitlement) return 'payment_due' as const;
  if (isLeagueBillingExempt(league)) return 'exempt' as const;
  return getLeaguePaidGolfers(league) >= getLeagueCapacity(league)
    ? ('active' as const)
    : ('payment_due' as const);
};

export const getEntitlementStatus = (input: {
  paidGolfers: number;
  refundedGolfers: number;
  requiredGolfers: number;
  consumed: boolean;
}) => {
  const netPaid = Math.max(0, input.paidGolfers - input.refundedGolfers);
  if (input.paidGolfers > 0 && netPaid === 0) return SEASON_ENTITLEMENT_STATUSES.refunded;
  if (input.refundedGolfers > 0) return SEASON_ENTITLEMENT_STATUSES.partiallyRefunded;
  if (input.consumed) return SEASON_ENTITLEMENT_STATUSES.consumed;
  if (netPaid >= input.requiredGolfers) return SEASON_ENTITLEMENT_STATUSES.paid;
  return SEASON_ENTITLEMENT_STATUSES.pendingPayment;
};

export const prepareSeasonEntitlement = async (
  input: {
    billingOwnerId: number;
    draftKey: string;
    requiredGolfers: number;
    renewedFromLeagueId?: number | null;
  },
  db: typeof prisma | Prisma.TransactionClient = prisma,
) => {
  const existing = await db.league_season_entitlement.upsert({
    where: {
      billingOwnerId_draftKey: {
        billingOwnerId: input.billingOwnerId,
        draftKey: input.draftKey,
      },
    },
    create: {
      billingOwnerId: input.billingOwnerId,
      draftKey: input.draftKey,
      requiredGolfers: input.requiredGolfers,
      renewedFromLeagueId: input.renewedFromLeagueId || null,
    },
    update: {},
    include: { league: { select: { id: true, name: true } } },
  });
  if (existing.league) {
    throw new Error(`This paid season was already used to create ${existing.league.name}.`);
  }
  if (
    Number(existing.renewedFromLeagueId || 0) !== Number(input.renewedFromLeagueId || 0)
  ) {
    throw new Error('This saved payment belongs to a different league season.');
  }
  if (existing.requiredGolfers !== input.requiredGolfers) {
    return db.league_season_entitlement.update({
      where: { id: existing.id },
      data: { requiredGolfers: input.requiredGolfers },
      include: { league: { select: { id: true, name: true } } },
    });
  }
  return existing;
};
