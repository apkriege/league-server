import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = {
  event: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  round: {
    count: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  score: {
    deleteMany: vi.fn(),
  },
  flight: {
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  team_event_points: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  team: {
    update: vi.fn(),
  },
  player: {
    update: vi.fn(),
  },
  $transaction: vi.fn(async (arg: any) => {
    if (typeof arg === 'function') return arg(mockPrisma);
    return [];
  }),
};

const processMock = vi.fn();
const editRoundsMock = vi.fn();
const scoringRunMock = vi.fn();

vi.mock('../../prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('../services/round', () => {
  function Round(this: any) {
    this.process = processMock;
    this.editRounds = editRoundsMock;
  }
  return { Round };
});

vi.mock('../services/scoring', () => {
  function Scoring(this: any) {
    this.run = scoringRunMock;
  }
  return { Scoring };
});

const buildReq = (method: 'post' | 'put', existingBody?: any) =>
  ({
    method,
    params: { leagueId: '10', eventId: '99' },
    query: {},
    body: existingBody || [
      {
        flightId: 1,
        playerId: 101,
        scores: { 1: 4, 2: 5, 3: 3 },
      },
    ],
  }) as any;

const buildRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const eventFixture = {
  id: 99,
  leagueId: 10,
  holes: 9,
  flights: [
    {
      id: 1,
      players: [{ playerId: 101, player: { id: 101 } }],
      teams: [],
    },
  ],
};

describe('ScoreController create/update score endpoints', async () => {
  const ScoreController = (await import('../controllers/round')).default;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.event.findFirst.mockResolvedValue(eventFixture as any);
    mockPrisma.event.update.mockResolvedValue({});
    mockPrisma.round.findMany.mockResolvedValue([]);
    mockPrisma.flight.update.mockResolvedValue({});
    mockPrisma.flight.updateMany.mockResolvedValue({ count: 0 });
    processMock.mockResolvedValue(undefined);
    editRoundsMock.mockResolvedValue(undefined);
    scoringRunMock.mockResolvedValue(undefined);
  });

  it('POST rejects with 409 when submitted player rounds already exist', async () => {
    mockPrisma.round.count.mockResolvedValueOnce(1);

    const req = buildReq('post');
    const res = buildRes();

    await ScoreController.createLeagueEventScores(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Rounds already exist for submitted players. Use update endpoint to edit scores.',
    });
    expect(processMock).not.toHaveBeenCalled();
    expect(editRoundsMock).not.toHaveBeenCalled();
    expect(scoringRunMock).not.toHaveBeenCalled();
  });

  it('PUT rejects with 400 when submitted player rounds do not exist', async () => {
    mockPrisma.round.count.mockResolvedValueOnce(0);

    const req = buildReq('put');
    const res = buildRes();

    await ScoreController.updateLeagueEventScores(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'No existing rounds found for submitted players. Use create endpoint first.',
    });
    expect(processMock).not.toHaveBeenCalled();
    expect(editRoundsMock).not.toHaveBeenCalled();
    expect(scoringRunMock).not.toHaveBeenCalled();
  });

  it('POST creates new rounds and scores event when no existing submitted rounds', async () => {
    mockPrisma.round.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    const req = buildReq('post');
    const res = buildRes();

    await ScoreController.createLeagueEventScores(req, res);

    expect(processMock).toHaveBeenCalledTimes(1);
    expect(editRoundsMock).not.toHaveBeenCalled();
    expect(scoringRunMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Scores saved and event completed',
      isComplete: true,
    });
  });

  it('PUT updates existing rounds and scores event', async () => {
    mockPrisma.round.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const req = buildReq('put');
    const res = buildRes();

    await ScoreController.updateLeagueEventScores(req, res);

    expect(processMock).not.toHaveBeenCalled();
    expect(editRoundsMock).toHaveBeenCalledTimes(1);
    expect(scoringRunMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Scores saved and event completed',
      isComplete: true,
    });
  });
});
