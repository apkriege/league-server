import { describe, expect, it } from 'vitest';
import {
  getEntitlementStatus,
  getNetPaidGolfers,
  normalizeBillingDraftKey,
} from '../services/seasonEntitlement';

describe('season entitlements', () => {
  it('accepts durable draft keys and rejects short or unsafe values', () => {
    expect(normalizeBillingDraftKey('season-draft-2026-abc123')).toBe('season-draft-2026-abc123');
    expect(normalizeBillingDraftKey('short')).toBeNull();
    expect(normalizeBillingDraftKey('unsafe draft key with spaces')).toBeNull();
  });

  it('keeps refunds attached to the exact entitlement', () => {
    expect(getNetPaidGolfers({ paidGolfers: 12, refundedGolfers: 3 })).toBe(9);
    expect(
      getEntitlementStatus({
        paidGolfers: 12,
        refundedGolfers: 3,
        requiredGolfers: 12,
        consumed: true,
      }),
    ).toBe('partially_refunded');
    expect(
      getEntitlementStatus({
        paidGolfers: 12,
        refundedGolfers: 12,
        requiredGolfers: 12,
        consumed: true,
      }),
    ).toBe('refunded');
  });
});
