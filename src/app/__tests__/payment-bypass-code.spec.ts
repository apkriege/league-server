import { describe, expect, it, vi } from 'vitest';

vi.mock('../../prisma', () => ({ prisma: {} }));

import {
  generatePaymentBypassCode,
  getPaymentBypassCodeStatus,
  hashPaymentBypassCode,
} from '../services/paymentBypassCode';

describe('one-time payment access codes', () => {
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
});
