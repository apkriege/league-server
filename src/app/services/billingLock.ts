import { Prisma } from '@prisma/client';

export const lockAdminBilling = async (tx: Prisma.TransactionClient, adminId: number) => {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "user" WHERE id = ${adminId} FOR UPDATE`);
};

export const lockLeagueCapacity = async (tx: Prisma.TransactionClient, leagueId: number) => {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "league" WHERE id = ${leagueId} FOR UPDATE`);
};

export const lockSeasonEntitlement = async (
  tx: Prisma.TransactionClient,
  entitlementId: number,
) => {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "league_season_entitlement" WHERE id = ${entitlementId} FOR UPDATE`,
  );
};
