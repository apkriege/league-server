import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = {
  event: {
    findFirst: vi.fn(),
  },
  round: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  score: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  player: {
    update: vi.fn(),
    findUnique: vi.fn(),
  },
};

vi.mock('@prisma/client', () => {
  function PrismaClient(this: any) {
    return mockPrisma;
  }

  return {
    PrismaClient,
  };
});

const buildTeeHoles = () =>
  Array.from({ length: 9 }, (_, idx) => ({
    num: idx + 1,
    hcp: idx + 1,
    par: 4,
  }));

const buildEvent = (playerHandicap: number) => ({
  id: 99,
  courseId: 1,
  teeId: 1,
  holes: 9,
  startSide: 'front',
  date: new Date('2026-04-16T00:00:00.000Z'),
  scoringFormat: 'match',
  tee: {
    slopeFrontMen: 120,
    slopeBackMen: 120,
    slopeMen: 120,
    ratingFrontMen: 36,
    ratingBackMen: 36,
    ratingMen: 72,
    holes: buildTeeHoles(),
  },
  flights: [
    {
      players: [
        {
          player: {
            id: 1,
            firstName: 'Test',
            lastName: 'Player',
            handicap: playerHandicap,
          },
        },
      ],
      teams: [],
    },
  ],
});

describe('Round service handicap behavior', async () => {
  const { Round } = await import('../services/round');

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.event.findFirst.mockResolvedValue(buildEvent(10));
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 1,
      handicap: 10,
      rounds: [],
    });
    mockPrisma.player.update.mockResolvedValue({});
    mockPrisma.score.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.score.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.round.create.mockResolvedValue({ id: 11 });
    mockPrisma.round.update.mockResolvedValue({ id: 10 });
  });

  it('uses existing round preHandicap when editing rounds', async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 10,
      opponentId: 2,
      preHandicap: 0,
      pointsEarned: 6,
      matchPoints: 2,
      scores: [
        { hole: 1, gross: 5 },
        { hole: 2, gross: 5 },
      ],
    });

    const rounds = new Round(99, [
      {
        flightId: 1,
        playerId: 1,
        scores: { 1: 4, 2: 5 },
      },
    ]);

    await rounds.editRounds();

    expect(mockPrisma.round.update).toHaveBeenCalledTimes(1);
    const updateArg = mockPrisma.round.update.mock.calls[0][0];
    expect(updateArg.data.preHandicap).toBe(0);
    expect(updateArg.data.opponentId).toBe(2);
    expect(updateArg.data.pointsEarned).toBe(6);
    expect(updateArg.data.matchPoints).toBe(2);

    expect(mockPrisma.score.createMany).toHaveBeenCalledTimes(1);
    const createdScores = mockPrisma.score.createMany.mock.calls[0][0].data;
    const hole1 = createdScores.find((s: any) => s.hole === 1);
    // With preHandicap 0, no pops should be applied.
    expect(hole1.net).toBe(4);
  });

  it('uses current player handicap when creating rounds', async () => {
    mockPrisma.round.findUnique.mockResolvedValue(null);

    const rounds = new Round(99, [
      {
        flightId: 1,
        playerId: 1,
        scores: { 1: 4, 2: 5 },
      },
    ]);

    await rounds.process();

    expect(mockPrisma.round.create).toHaveBeenCalledTimes(1);
    const createArg = mockPrisma.round.create.mock.calls[0][0];
    expect(createArg.data.preHandicap).toBe(10);

    expect(mockPrisma.score.createMany).toHaveBeenCalledTimes(1);
    const createdScores = mockPrisma.score.createMany.mock.calls[0][0].data;
    const hole1 = createdScores.find((s: any) => s.hole === 1);
    // With handicap 10 over 9 holes, hole 1 gets 2 pops.
    expect(hole1.net).toBe(2);
  });

  it('skips edit updates when submitted scores are unchanged', async () => {
    mockPrisma.round.findUnique.mockResolvedValue({
      id: 10,
      opponentId: 2,
      preHandicap: 7,
      pointsEarned: 4,
      matchPoints: 1,
      scores: [
        { hole: 1, gross: 4 },
        { hole: 2, gross: 5 },
      ],
    });

    const rounds = new Round(99, [
      {
        flightId: 1,
        playerId: 1,
        scores: { 1: 4, 2: 5 },
      },
    ]);

    await rounds.editRounds();

    expect(mockPrisma.round.update).not.toHaveBeenCalled();
    expect(mockPrisma.score.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.score.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.player.update).not.toHaveBeenCalled();
  });
});
