import { prisma } from '../../prisma';

type LeagueEventOrderRow = {
  id: number;
  status: string;
  isComplete: boolean;
  _count: {
    rounds: number;
  };
};

const isCompletedEvent = (event: Pick<LeagueEventOrderRow, 'status' | 'isComplete'>) =>
  event.isComplete || String(event.status || '').toLowerCase() === 'completed';

const hasAnyScores = (event: Pick<LeagueEventOrderRow, '_count' | 'status' | 'isComplete'>) =>
  Number(event._count?.rounds || 0) > 0 || isCompletedEvent(event);

export const getLeagueScoreOrder = async (leagueId: number) => {
  const events = await prisma.event.findMany({
    where: {
      leagueId,
      isDeleted: false,
    },
    select: {
      id: true,
      status: true,
      isComplete: true,
      _count: {
        select: {
          rounds: true,
        },
      },
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });

  const nextScorableEvent = events.find((event) => !isCompletedEvent(event)) || null;
  const latestScoredEvent = [...events].reverse().find((event) => hasAnyScores(event)) || null;

  return {
    nextScorableEventId: nextScorableEvent ? Number(nextScorableEvent.id) : null,
    latestScoredEventId: latestScoredEvent ? Number(latestScoredEvent.id) : null,
  };
};

export const buildEventScoreAccess = (
  eventId: number,
  order: { nextScorableEventId: number | null; latestScoredEventId: number | null },
) => ({
  canEnterScores: order.nextScorableEventId === Number(eventId),
  canEditScores: order.latestScoredEventId === Number(eventId),
});
