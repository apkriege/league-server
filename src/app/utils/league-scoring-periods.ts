export type NormalizedScoringPeriod = {
  name: string;
  position: number;
  startDate: Date;
  endDate: Date;
};

type LeagueDateRange = {
  startDate: Date;
  endDate: Date;
};

export const scoringPeriodDateKey = (value: unknown) => {
  const source = value instanceof Date ? value.toISOString() : String(value ?? '').trim();
  const match = source.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) throw new Error('Scoring period dates must use YYYY-MM-DD.');
  return match[1];
};

const nextDateKey = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

export const normalizeLeagueScoringPeriods = (
  value: unknown,
  league: LeagueDateRange,
): NormalizedScoringPeriod[] => {
  if (value == null) return [];
  if (Array.isArray(value) && value.length === 0) return [];
  if (!Array.isArray(value) || value.length < 2 || value.length > 12) {
    throw new Error('Scoring periods must contain between 2 and 12 date ranges.');
  }

  const leagueStart = scoringPeriodDateKey(league.startDate);
  const leagueEnd = scoringPeriodDateKey(league.endDate);
  const periods = value.map((period: any, index) => {
    const name = String(period?.name || '').trim();
    const startDate = scoringPeriodDateKey(period?.startDate);
    const endDate = scoringPeriodDateKey(period?.endDate);
    if (!name || name.length > 50) {
      throw new Error('Each scoring period needs a name no longer than 50 characters.');
    }
    if (startDate > endDate) throw new Error(`${name} must end on or after its start date.`);
    if (startDate < leagueStart || endDate > leagueEnd) {
      throw new Error('Scoring period dates must stay within the league dates.');
    }

    return {
      name,
      position: index + 1,
      startDate: new Date(`${startDate}T00:00:00.000Z`),
      endDate: new Date(`${endDate}T00:00:00.000Z`),
    };
  });

  for (let index = 1; index < periods.length; index += 1) {
    const expectedStart = nextDateKey(scoringPeriodDateKey(periods[index - 1].endDate));
    if (scoringPeriodDateKey(periods[index].startDate) !== expectedStart) {
      throw new Error('Scoring periods must be consecutive and cannot overlap or leave gaps.');
    }
  }

  return periods;
};
