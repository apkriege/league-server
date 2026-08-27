import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
  findMany: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock('../../prisma', () => ({
  prisma: {
    round: {
      aggregate: mocks.aggregate,
      findMany: mocks.findMany,
      groupBy: mocks.groupBy,
    },
  },
}));

import { EventMetrics } from '../services/eventMetrics';

const round = (
  playerId: number,
  lastName: string,
  gross: number,
  net: number,
  pointsEarned: number,
) => ({
  playerId,
  preHandicap: 10,
  postHandicap: 9.8,
  gross,
  net,
  pointsEarned,
  matchPoints: 1,
  eagles: 0,
  birdies: 1,
  pars: 1,
  bogeys: 0,
  doubleBogeys: 0,
  tripleBogeys: 0,
  player: { firstName: `Player${playerId}`, lastName, handicap: 10 },
  scores: [
    { hole: 1, gross: playerId === 1 ? 3 : 4, net: playerId === 1 ? 3 : 4, par: 4 },
    { hole: 2, gross: 4, net: 4, par: 4 },
  ],
});

describe('event metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([
      round(1, 'Alpha', 72, 62, 8),
      round(2, 'Bravo', 76, 66, 4),
    ]);
    mocks.aggregate.mockResolvedValue({
      _sum: {
        eagles: 0,
        birdies: 8,
        pars: 20,
        bogeys: 4,
        doubleBogeys: 2,
        tripleBogeys: 0,
      },
    });
    mocks.groupBy.mockResolvedValue([{ eventId: 10 }, { eventId: 11 }]);
  });

  it('loads rounds once and derives all event views from that result', async () => {
    const metrics = await new EventMetrics(10, 3).processEvent();

    expect(mocks.findMany).toHaveBeenCalledOnce();
    expect(mocks.aggregate).toHaveBeenCalledOnce();
    expect(mocks.groupBy).toHaveBeenCalledOnce();
    expect(metrics.scores).toHaveLength(2);
    expect(metrics.leaderboards.playerPoints.map((entry) => entry.playerId)).toEqual([1, 2]);
    expect(metrics.leaderboards.playerLowGross.map((entry) => entry.playerId)).toEqual([1, 2]);
    expect(metrics.skins.playerSkins).toEqual([
      expect.objectContaining({ playerId: 1, hole: '1', gross: 3 }),
    ]);
    expect(metrics.scoreDistribution).toMatchObject({
      thisEvent: { birdies: 2, pars: 2 },
      seasonAvg: { birdies: 4, pars: 10 },
    });
  });
});
