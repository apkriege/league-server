import { prisma } from '../../prisma';
import { lockLeagueCapacity } from './billingLock';
import { scoringTransactionOptions } from './scoringTransaction';

export async function removeUnscoredEvent(leagueId: number, eventId: number, action: 'cancel' | 'delete') {
  return prisma.$transaction(async (tx) => {
    await lockLeagueCapacity(tx, leagueId);
    const event = await tx.event.findFirst({
      where: { id: eventId, leagueId, deletedAt: null },
      include: { _count: { select: { rounds: true, teamRounds: true } } },
    });
    if (!event) return { status: 404, message: 'Event not found' } as const;
    if (event.status === 'completed' || event._count.rounds || event._count.teamRounds) {
      return { status: 409, message: `Events with scores cannot be ${action === 'cancel' ? 'canceled' : 'deleted'}.` } as const;
    }
    const updated = await tx.event.update({
      where: { id: eventId },
      data: action === 'cancel' ? { status: 'canceled' } : { deletedAt: new Date() },
    });
    return { status: 200, event: updated } as const;
  }, scoringTransactionOptions);
}
