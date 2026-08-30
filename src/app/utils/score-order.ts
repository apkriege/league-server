type LeagueEventOrderRow = {
  id: number;
  status: string;
  _count: {
    rounds: number;
    teamRounds?: number;
  };
};

const isCompletedEvent = (event: Pick<LeagueEventOrderRow, 'status'>) =>
  String(event.status || '').toLowerCase() === 'completed';

const hasAnyScores = (event: Pick<LeagueEventOrderRow, '_count' | 'status'>) =>
  Number(event._count?.rounds || 0) > 0 ||
  Number(event._count?.teamRounds || 0) > 0 ||
  isCompletedEvent(event);

const isCanceledEvent = (event: Pick<LeagueEventOrderRow, 'status'>) =>
  String(event.status || '').toLowerCase() === 'canceled';

export const buildEventScoreAccess = (
  event: Pick<LeagueEventOrderRow, 'status' | '_count'>,
) => ({
  canEnterScores: !isCanceledEvent(event) && !isCompletedEvent(event),
  canEditScores: !isCanceledEvent(event) && hasAnyScores(event),
});
