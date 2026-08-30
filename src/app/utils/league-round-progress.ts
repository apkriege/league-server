export type LeagueRoundProgressEvent = {
  status?: string | null;
  type?: string | null;
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

    return !event.deletedAt && status !== 'canceled' && type !== 'off';
  });

  return {
    completedRoundCount: scheduledRounds.filter(
      (event) => String(event.status || '').toLowerCase() === 'completed',
    ).length,
    roundCount: scheduledRounds.length,
  };
};
