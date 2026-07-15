import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUserById: vi.fn(),
  findLeague: vi.fn(),
}));

vi.mock('../models/user', () => ({
  default: { findById: mocks.findUserById },
}));
vi.mock('../../prisma', () => ({
  prisma: {
    league: { findFirst: mocks.findLeague },
  },
}));
vi.mock('../middleware/logging', () => ({ logAuthFailure: vi.fn() }));

const buildRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.sendStatus = vi.fn().mockReturnValue(res);
  return res;
};

describe('authorization guards', async () => {
  const { leagueAdminGuard, userSelfOrAdminGuard } = await import('../middleware/auth-guard');

  beforeEach(() => vi.clearAllMocks());

  it('does not let a regular league admin update another user', async () => {
    mocks.findUserById.mockResolvedValue({ id: 7, role: 'ADMIN' });
    const req = { session: { userId: 7 }, params: { id: '8' } } as any;
    const res = buildRes();
    const next = vi.fn();

    await userSelfOrAdminGuard(req, res, next);

    expect(res.sendStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows an admin to update only their own account', async () => {
    mocks.findUserById.mockResolvedValue({ id: 7, role: 'ADMIN' });
    const req = { session: { userId: 7 }, params: { id: '7' } } as any;
    const next = vi.fn();

    await userSelfOrAdminGuard(req, buildRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows a super admin to manage another user', async () => {
    mocks.findUserById.mockResolvedValue({ id: 1, role: 'SUPER' });
    const req = { session: { userId: 1 }, params: { id: '8' } } as any;
    const next = vi.fn();

    await userSelfOrAdminGuard(req, buildRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('treats a soft-deleted league as unavailable to its former admin', async () => {
    mocks.findUserById.mockResolvedValue({ id: 7, role: 'ADMIN' });
    mocks.findLeague.mockResolvedValue(null);
    const req = { session: { userId: 7 }, params: { id: '12' } } as any;
    const res = buildRes();
    const next = vi.fn();

    await leagueAdminGuard(req, res, next);

    expect(mocks.findLeague).toHaveBeenCalledWith({
      where: { id: 12, deletedAt: null },
      select: { adminId: true },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
});
