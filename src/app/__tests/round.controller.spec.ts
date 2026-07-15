import { beforeEach, describe, expect, it, vi } from 'vitest';

const processMock = vi.fn();
const roundConstructorMock = vi.fn();
const mockPrisma: any = {
  event: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  flight: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  round: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  team_event_points: { findUnique: vi.fn(), upsert: vi.fn() },
  team: { update: vi.fn() },
  league_onboarding: { upsert: vi.fn() },
};
mockPrisma.$transaction = vi.fn(async (callback: any) => callback(mockPrisma));

vi.mock('../../prisma', () => ({ prisma: mockPrisma }));
vi.mock('../services/round', () => ({
  Round: function (...args: any[]) {
    roundConstructorMock(...args);
    return { process: processMock };
  },
}));
vi.mock('../utils/audit', () => ({ writeAuditLog: vi.fn() }));
vi.mock('../utils/notifications', () => ({ notifyLeagueAdmins: vi.fn() }));

const eventFixture = {
  id: 99,
  leagueId: 10,
  name: 'Week 1',
  status: 'upcoming',
  isComplete: false,
  isDeleted: false,
  deletedAt: null,
  format: 'individual',
  scoringFormat: 'match',
  pointsEnabled: true,
  ptsPerHole: 1,
  ptsPerMatch: 2,
  ptsPerTeamWin: 0,
  holes: 9,
};

const payload = {
  eventId: 99,
  flightId: 1,
  players: [
    {
      playerId: 101,
      opponentId: 102,
      scores: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, 4])),
      points: 5,
      matchPoints: 2,
    },
    {
      playerId: 102,
      opponentId: 101,
      scores: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, 5])),
      points: 4,
      matchPoints: 0,
    },
  ],
  teams: [],
};

const buildReq = (body: any = payload) =>
  ({ params: { leagueId: '10', eventId: '99' }, body, session: { userId: 7 } }) as any;

const buildRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('ScoreController transactional score validation', async () => {
  const ScoreController = (await import('../controllers/round')).default;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.event.findFirst.mockResolvedValue(eventFixture);
    mockPrisma.event.findMany.mockResolvedValue([
      { id: 99, status: 'upcoming', isComplete: false, _count: { rounds: 0 } },
    ]);
    mockPrisma.flight.findFirst.mockResolvedValue({
      id: 1,
      eventId: 99,
      status: 'not_started',
      players: [
        { playerId: 101, opponentId: 102 },
        { playerId: 102, opponentId: 101 },
      ],
      teams: [],
    });
    mockPrisma.flight.findMany.mockResolvedValue([{ status: 'in_progress' }]);
    mockPrisma.flight.update.mockResolvedValue({});
    mockPrisma.league_onboarding.upsert.mockResolvedValue({});
    processMock.mockResolvedValue(undefined);
  });

  it('rejects a body event id that differs from the guarded route', async () => {
    const res = buildRes();
    await ScoreController.createLeagueEventScores(buildReq({ ...payload, eventId: 100 }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.event.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a flight from another event before processing rounds', async () => {
    mockPrisma.flight.findFirst.mockResolvedValue(null);
    const res = buildRes();
    await ScoreController.createLeagueEventScores(buildReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(processMock).not.toHaveBeenCalled();
    expect(mockPrisma.flight.update).not.toHaveBeenCalled();
  });

  it('requires exactly the players assigned to the flight', async () => {
    const res = buildRes();
    await ScoreController.createLeagueEventScores(
      buildReq({ ...payload, players: payload.players.slice(0, 1) }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(processMock).not.toHaveBeenCalled();
  });

  it('processes every assigned player inside the transaction', async () => {
    const res = buildRes();
    await ScoreController.createLeagueEventScores(buildReq(), res);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(processMock).toHaveBeenCalledTimes(2);
    expect(roundConstructorMock).toHaveBeenCalledWith(99, expect.any(Object), undefined, mockPrisma);
    expect(mockPrisma.flight.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'completed' },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rolls back the update path when an assigned round is missing', async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      { id: 99, status: 'completed', isComplete: true, _count: { rounds: 2 } },
    ]);
    mockPrisma.round.findFirst.mockResolvedValue(null);
    const res = buildRes();
    await ScoreController.updateLeagueEventScores(buildReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.flight.update).not.toHaveBeenCalled();
  });
});
