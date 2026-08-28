import { describe, expect, it } from 'vitest';
import {
  buildPlayerIntelligence,
  type IntelligencePlayer,
  type IntelligenceRound,
} from '../utils/player-intelligence';

const makeRound = (
  id: number,
  values: {
    eventId?: number;
    date?: string;
    courseId?: number;
    courseName?: string;
    teeId?: number;
    points?: number;
    opponentId?: number | null;
    scores?: Array<{ hole: number; par: number; gross: number; net?: number }>;
  } = {},
): IntelligenceRound => {
  const scores = (values.scores ?? [
    { hole: 1, par: 4, gross: 5 },
    { hole: 2, par: 3, gross: 3 },
    { hole: 3, par: 5, gross: 4 },
  ]).map((score) => ({ ...score, net: score.net ?? score.gross }));
  return {
    id,
    eventId: values.eventId ?? id,
    eventName: `Event ${id}`,
    date: values.date ?? `2026-05-${String(id).padStart(2, '0')}`,
    courseId: values.courseId ?? 1,
    courseName: values.courseName ?? 'North Course',
    teeId: values.teeId ?? 1,
    teeName: 'Blue',
    holesPlayed: scores.length,
    gross: scores.reduce((sum, score) => sum + score.gross, 0),
    net: scores.reduce((sum, score) => sum + score.net, 0),
    points: values.points ?? 0,
    birdies: scores.filter((score) => score.gross < score.par).length,
    pars: scores.filter((score) => score.gross === score.par).length,
    handicap: 10,
    opponentId: values.opponentId ?? null,
    scores,
  };
};

const build = (
  players: IntelligencePlayer[],
  teamEvents: Parameters<typeof buildPlayerIntelligence>[0]['teamEvents'] = [],
) =>
  buildPlayerIntelligence({
    playerId: 1,
    players,
    seasons: [
      {
        leagueId: 10,
        leagueName: '2026 League',
        year: 2026,
        handicap: 10,
        rounds: players[0]?.rounds ?? [],
      },
    ],
    teamEvents,
  });

describe('buildPlayerIntelligence', () => {
  it('builds comparable par, hole, ringer, record, ranking, and streak insights', () => {
    const playerRounds = [
      makeRound(1),
      makeRound(2, {
        scores: [
          { hole: 1, par: 4, gross: 4 },
          { hole: 2, par: 3, gross: 3 },
          { hole: 3, par: 5, gross: 5 },
        ],
      }),
    ];
    const leagueRounds = [
      makeRound(11, {
        scores: [
          { hole: 1, par: 4, gross: 6 },
          { hole: 2, par: 3, gross: 4 },
          { hole: 3, par: 5, gross: 6 },
        ],
      }),
    ];
    const result = build([
      { id: 1, name: 'Ada Player', rounds: playerRounds },
      { id: 2, name: 'Bea Player', rounds: leagueRounds },
    ]);

    expect(result.sample).toEqual({ rounds: 2, holes: 6, comparableHoles: 3 });
    expect(result.parSplits.find((split) => split.par === 4)?.versusLeague).toBeLessThan(0);
    expect(result.holeInsights.strengths[0]).toMatchObject({ courseName: 'North Course' });
    expect(result.ringers[0]).toMatchObject({ holes: 3, score: 11, toPar: -1 });
    expect(result.streaks.bestParOrBetter).toBeGreaterThanOrEqual(3);
    expect(result.categoryRankings.find((ranking) => ranking.key === 'scoring')).toMatchObject({
      rank: 1,
      total: 2,
    });
  });

  it('keeps personal records separated by round length', () => {
    const nineHoleScores = Array.from({ length: 9 }, (_, index) => ({
      hole: index + 1,
      par: 4,
      gross: index === 0 ? 3 : 4,
    }));
    const result = build([
      {
        id: 1,
        name: 'Ada Player',
        rounds: [makeRound(1, { points: 7, scores: nineHoleScores })],
      },
    ]);

    expect(result.personalRecords).toEqual([
      expect.objectContaining({ holes: 9, rounds: 1, lowGross: 35, lowNet: 35, bestPoints: 7 }),
    ]);
  });

  it('keeps ringers isolated by course and tee', () => {
    const result = build([
      {
        id: 1,
        name: 'Ada Player',
        rounds: [
          makeRound(1, { courseId: 1, courseName: 'North Course', teeId: 1 }),
          makeRound(2, { courseId: 2, courseName: 'South Course', teeId: 1 }),
          makeRound(3, { courseId: 1, courseName: 'North Course', teeId: 2 }),
        ],
      },
    ]);

    expect(result.ringers).toHaveLength(3);
    expect(result.ringers.every((ringer) => ringer.holes === 3)).toBe(true);
  });

  it('calculates configured head-to-head and team rivalry records from recorded points', () => {
    const playerRound = makeRound(1, { eventId: 50, points: 4, opponentId: 2 });
    const opponentRound = makeRound(2, { eventId: 50, points: 2, opponentId: 1 });
    const result = build(
      [
        { id: 1, name: 'Ada Player', rounds: [playerRound] },
        { id: 2, name: 'Bea Player', rounds: [opponentRound] },
      ],
      [
        {
          eventId: 50,
          eventName: 'Week One',
          date: '2026-05-01',
          opponentId: 20,
          opponentName: 'The Drivers',
          teamPoints: 8,
          opponentPoints: 6,
        },
        {
          eventId: 51,
          eventName: 'Week Two',
          date: '2026-05-08',
          opponentId: 20,
          opponentName: 'The Drivers',
          teamPoints: 5,
          opponentPoints: 5,
        },
      ],
    );

    expect(result.headToHead).toMatchObject({ wins: 1, losses: 0, ties: 0 });
    expect(result.headToHead.opponents[0]).toMatchObject({
      opponentName: 'Bea Player',
      matches: 1,
      pointsFor: 4,
      pointsAgainst: 2,
    });
    expect(result.teamRivalries[0]).toMatchObject({
      opponentName: 'The Drivers',
      matches: 2,
      wins: 1,
      ties: 1,
      pointsFor: 13,
      pointsAgainst: 11,
    });
  });

  it('returns useful empty states without manufacturing comparisons', () => {
    const result = build([{ id: 1, name: 'Ada Player', rounds: [] }]);

    expect(result.pulse.averageToPar).toBeNull();
    expect(result.parSplits.every((split) => split.averageToPar == null)).toBe(true);
    expect(result.headToHead.opponents).toEqual([]);
    expect(result.teamRivalries).toEqual([]);
    expect(result.takeaways[0].title).toBe('Form baseline in progress');
  });

  it('waits for two complete three-round windows before calling a form trend', () => {
    const fourRounds = Array.from({ length: 4 }, (_, index) => makeRound(index + 1));
    const sixRounds = Array.from({ length: 6 }, (_, index) =>
      makeRound(index + 1, {
        scores: [
          { hole: 1, par: 4, gross: index < 3 ? 6 : 4 },
          { hole: 2, par: 4, gross: index < 3 ? 6 : 4 },
          { hole: 3, par: 4, gross: index < 3 ? 6 : 4 },
        ],
      }),
    );

    expect(build([{ id: 1, name: 'Ada Player', rounds: fourRounds }]).pulse.formDelta).toBeNull();
    expect(build([{ id: 1, name: 'Ada Player', rounds: sixRounds }]).pulse.formDelta).toBeLessThan(0);
  });

  it('compares holes against peers and never labels a worse hole as a strength', () => {
    const result = build([
      {
        id: 1,
        name: 'Ada Player',
        rounds: [makeRound(1, { scores: [{ hole: 1, par: 4, gross: 7 }] })],
      },
      {
        id: 2,
        name: 'Bea Player',
        rounds: [makeRound(2, { scores: [{ hole: 1, par: 4, gross: 5 }] })],
      },
    ]);

    expect(result.holeInsights.strengths).toEqual([]);
    expect(result.holeInsights.opportunities[0]).toMatchObject({ versusLeague: 2 });
    expect(result.parSplits.find((split) => split.par === 4)?.leagueAverageToPar).toBe(1);
  });
});
