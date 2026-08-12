import { Prisma } from '@prisma/client';

const ADMIN_BILLING_LOCK = 71001;
const LEAGUE_CAPACITY_LOCK = 71002;

const acquireTransactionLock = async (
  tx: Prisma.TransactionClient,
  namespace: number,
  id: number,
) => {
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${namespace}, ${id})`);
};

export const lockAdminBilling = (tx: Prisma.TransactionClient, adminId: number) =>
  acquireTransactionLock(tx, ADMIN_BILLING_LOCK, adminId);

export const lockLeagueCapacity = (tx: Prisma.TransactionClient, leagueId: number) =>
  acquireTransactionLock(tx, LEAGUE_CAPACITY_LOCK, leagueId);
