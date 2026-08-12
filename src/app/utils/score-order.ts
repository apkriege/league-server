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

const isCanceledEvent = (event: Pick<LeagueEventOrderRow, 'status'>) =>
  String(event.status || '').toLowerCase() === 'canceled';

export const buildEventScoreAccess = (
  event: Pick<LeagueEventOrderRow, 'status' | 'isComplete' | '_count'>,
) => ({
  canEnterScores: !isCanceledEvent(event) && !isCompletedEvent(event),
  canEditScores: !isCanceledEvent(event) && hasAnyScores(event),
});
