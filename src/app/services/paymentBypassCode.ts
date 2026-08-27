import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import { lockAdminBilling } from './billingLock';
import {
  getAllocatedGolfersForAdmin,
  getBillingState,
  getPendingLeagueBypassCodeId,
  mergeBillingMetadata,
} from '../utils/billing';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_EXPIRATION_DAYS = 30;

export const normalizePaymentBypassCode = (value: unknown) =>
  String(value || '').trim().toUpperCase();

export const hashPaymentBypassCode = (value: unknown) =>
  createHash('sha256').update(normalizePaymentBypassCode(value)).digest('hex');

const randomCodeSegment = (length: number) => {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
};

export const generatePaymentBypassCode = () =>
  `COMP-${randomCodeSegment(4)}-${randomCodeSegment(4)}-${randomCodeSegment(4)}`;

export const createPaymentBypassCode = async (
  createdById: number,
  input: { label?: unknown; expiresInDays?: unknown },
) => {
  const label = String(input.label || '').trim();
  if (label.length > 100) throw new Error('Code label must be 100 characters or fewer.');

  const expiresInDays = Number(input.expiresInDays ?? DEFAULT_EXPIRATION_DAYS);
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
    throw new Error('Expiration must be a whole number from 1 to 365 days.');
  }

  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generatePaymentBypassCode();
    try {
      const record = await prisma.payment_bypass_code.create({
        data: {
          codeHash: hashPaymentBypassCode(code),
          codeHint: `COMP-••••-••••-${code.slice(-4)}`,
          label: label || null,
          createdById,
          expiresAt,
        },
      });
      return { code, record };
    } catch (error: any) {
      if (error?.code !== 'P2002' || attempt === 4) throw error;
    }
  }
  throw new Error('Unable to generate a unique payment access code.');
};

export const getPaymentBypassCodeStatus = (code: {
  redeemedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
}) => {
  if (code.redeemedAt) return 'redeemed' as const;
  if (code.revokedAt) return 'revoked' as const;
  if (code.expiresAt && code.expiresAt <= new Date()) return 'expired' as const;
  return 'active' as const;
};

export const listPaymentBypassCodes = () =>
  prisma.payment_bypass_code.findMany({
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      redeemedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

export const revokePaymentBypassCode = async (id: number) => {
  const result = await prisma.payment_bypass_code.updateMany({
    where: { id, redeemedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
};

export const attachPendingPaymentBypassToLeague = async (
  tx: Prisma.TransactionClient,
  input: { userId: number; leagueId: number; userMetadata: unknown },
) => {
  const codeId = getPendingLeagueBypassCodeId(input.userMetadata);
  if (!codeId) return false;

  const assignedCode = await tx.payment_bypass_code.updateMany({
    where: {
      id: codeId,
      redeemedById: input.userId,
      redeemedAt: { not: null },
      redeemedLeagueId: null,
      revokedAt: null,
    },
    data: { redeemedLeagueId: input.leagueId },
  });
  if (assignedCode.count !== 1) return false;

  await tx.user.update({
    where: { id: input.userId },
    data: {
      metadata: mergeBillingMetadata(input.userMetadata, {
        pendingLeagueBypassCodeId: null,
        pendingLeagueBypassRedeemedAt: null,
      }),
    },
  });
  return true;
};

export const redeemPaymentBypassCode = async (userId: number, rawCode: unknown) => {
  const normalizedCode = normalizePaymentBypassCode(rawCode);
  if (normalizedCode.length < 8 || normalizedCode.length > 128) return null;
  const codeHash = hashPaymentBypassCode(normalizedCode);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await lockAdminBilling(tx, userId);
          const code = await tx.payment_bypass_code.findUnique({ where: { codeHash } });
          if (!code || getPaymentBypassCodeStatus(code) !== 'active') return null;

          const user = await tx.user.findFirst({
            where: { id: userId, deletedAt: null },
            select: { id: true, metadata: true },
          });
          if (!user) throw new Error('User not found');
          const allocatedGolfers = await getAllocatedGolfersForAdmin(user.id, undefined, tx);
          const currentBilling = getBillingState(user.metadata, allocatedGolfers);
          // Each account can hold only one pending one-league bypass. Do not consume another code
          // until the first entitlement has been attached to a newly created league.
          if (getPendingLeagueBypassCodeId(user.metadata)) {
            return null;
          }

          const redeemedAt = new Date();
          const claimed = await tx.payment_bypass_code.updateMany({
            where: {
              id: code.id,
              redeemedAt: null,
              revokedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: redeemedAt } }],
            },
            data: { redeemedById: userId, redeemedAt },
          });
          if (claimed.count !== 1) return null;

          const updatedUser = await tx.user.update({
            where: { id: user.id },
            data: {
              metadata: mergeBillingMetadata(user.metadata, {
                pendingLeagueBypassCodeId: code.id,
                pendingLeagueBypassRedeemedAt: redeemedAt.toISOString(),
              }),
            },
            select: { metadata: true },
          });
          return getBillingState(updatedUser.metadata, allocatedGolfers);
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error: any) {
      if (error?.code !== 'P2034' || attempt === 2) throw error;
    }
  }
  return null;
};
