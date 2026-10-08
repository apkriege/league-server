import type { Prisma } from '@prisma/client';
import { lockSeasonEntitlement } from './billingLock';

export const TRIAL_EVENT_LIMIT = 3;

export class TrialEventLimitError extends Error {}

export const getTrialScoringBlock = (entitlement: {
  status: string; trialEventCount: number; trialEventLimit: number;
}, previouslyScored: boolean): string | null =>
  entitlement.status === 'trialing' && !previouslyScored && entitlement.trialEventCount >= entitlement.trialEventLimit
    ? `Your free trial includes ${entitlement.trialEventLimit} scored events. Activate this league to score another event.`
    : null;

export const isTrialEligible = (user: {
  role: string;
  emailVerifiedAt: Date | null;
}) =>
  ['ADMIN', 'SUPER'].includes(user.role.toUpperCase()) &&
  user.emailVerifiedAt !== null;

export const reserveTrialScoredEvent = async (
  tx: Prisma.TransactionClient,
  leagueId: number,
  eventId: number,
) => {
  const league = await tx.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { entitlementId: true },
  });
  await lockSeasonEntitlement(tx, league.entitlementId);
  const entitlement = await tx.league_season_entitlement.findUniqueOrThrow({
    where: { id: league.entitlementId },
    select: { status: true, trialEventLimit: true, trialEventCount: true },
  });
  if (entitlement.status !== 'trialing') return;

  const existing = await tx.trial_scored_event.findUnique({
    where: { entitlementId_eventId: { entitlementId: league.entitlementId, eventId } },
    select: { eventId: true },
  });
  if (existing) return;
  const block = getTrialScoringBlock(entitlement, false);
  if (block) throw new TrialEventLimitError(block);

  await tx.trial_scored_event.create({
    data: { entitlementId: league.entitlementId, eventId },
  });
  await tx.league_season_entitlement.update({
    where: { id: league.entitlementId },
    data: { trialEventCount: { increment: 1 } },
  });
};
