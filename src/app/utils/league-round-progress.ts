export type LeagueRoundProgressEvent = {
  status?: string | null;
  type?: string | null;
  isComplete?: boolean | null;
  isDeleted?: boolean | null;
  deletedAt?: Date | string | null;
};

export type LeagueRoundProgress = {
  completedRoundCount: number;
  roundCount: number;
};

export const getLeagueRoundProgress = (
  events: readonly LeagueRoundProgressEvent[] = [],
): LeagueRoundProgress => {
  const scheduledRounds = events.filter((event) => {
    const status = String(event.status || '').toLowerCase();
    const type = String(event.type || '').toLowerCase();

    return !event.isDeleted && !event.deletedAt && status !== 'canceled' && type !== 'off';
  });

  return {
    completedRoundCount: scheduledRounds.filter(
      (event) => event.isComplete || String(event.status || '').toLowerCase() === 'completed',
    ).length,
    roundCount: scheduledRounds.length,
  };
};
