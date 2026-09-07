import type { Prisma } from '@prisma/client';
import { lockLeagueCapacity } from './billingLock';

export const scoringTransactionOptions = { maxWait: 30_000, timeout: 120_000 };

export async function lockScoringEvent(
  tx: Prisma.TransactionClient,
  leagueId: number,
  eventId: number,
  allowCompleted: boolean,
) {
  await lockLeagueCapacity(tx, leagueId);
  const event = await tx.event.findFirst({ where: { id: eventId, leagueId, deletedAt: null } });
  if (!event) throw new Error('Event not found');
  if (event.status === 'canceled' || (!allowCompleted && event.status === 'completed')) {
    throw new Error('Event cannot be edited in its current state');
  }
  return event;
}
