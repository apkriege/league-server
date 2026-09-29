import { describe, expect, it, vi } from 'vitest';
import { isTrialEligible, reserveTrialScoredEvent, TrialEventLimitError } from '../services/eventTrial';

const makeTx = (count: number, existing = false) => ({
  $queryRaw: vi.fn().mockResolvedValue([]),
  league: { findUniqueOrThrow: vi.fn().mockResolvedValue({ entitlementId: 5 }) },
  league_season_entitlement: {
    findUniqueOrThrow: vi.fn().mockResolvedValue({ status: 'trialing', trialEventLimit: 3, trialEventCount: count }),
    update: vi.fn().mockResolvedValue({}),
  },
  trial_scored_event: {
    findUnique: vi.fn().mockResolvedValue(existing ? { eventId: 9 } : null),
    create: vi.fn().mockResolvedValue({}),
  },
});

describe('scored-event trial', () => {
  it('is available to verified commissioners even after a prior trial', () => {
    const user = { role: 'ADMIN', emailVerifiedAt: new Date(), trialClaimedAt: new Date() };
    expect(isTrialEligible(user)).toBe(true);
    expect(isTrialEligible({ ...user, emailVerifiedAt: null })).toBe(false);
    expect(isTrialEligible({ ...user, role: 'USER' })).toBe(false);
  });

  it('counts the first scored flight once per event', async () => {
    const tx = makeTx(2);
    await reserveTrialScoredEvent(tx as never, 4, 9);
    expect(tx.trial_scored_event.create).toHaveBeenCalledWith({ data: { entitlementId: 5, eventId: 9 } });
    expect(tx.league_season_entitlement.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { trialEventCount: { increment: 1 } } });
  });

  it('allows another flight of an already-counted event after the limit', async () => {
    const tx = makeTx(3, true);
    await reserveTrialScoredEvent(tx as never, 4, 9);
    expect(tx.trial_scored_event.create).not.toHaveBeenCalled();
  });

  it('blocks a fourth distinct scored event', async () => {
    const tx = makeTx(3);
    await expect(reserveTrialScoredEvent(tx as never, 4, 10)).rejects.toBeInstanceOf(TrialEventLimitError);
    expect(tx.trial_scored_event.create).not.toHaveBeenCalled();
  });
});
