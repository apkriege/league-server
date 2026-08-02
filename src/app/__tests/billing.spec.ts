import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

vi.mock('../../prisma', () => ({
  prisma: { league: { findMany: findManyMock } },
}));

import {
  BILLING_MIN_GOLFERS,
  getAllocatedGolfersForAdmin,
  getLeagueBillableGolfers,
} from '../utils/billing';

describe('league billing', () => {
  beforeEach(() => findManyMock.mockReset());

  it('charges every league for the eight-golfer minimum', () => {
    expect(getLeagueBillableGolfers([])).toBe(BILLING_MIN_GOLFERS);
    expect(
      getLeagueBillableGolfers([
        { type: 'player' },
        { type: 'player' },
        { type: 'substitute' },
      ]),
    ).toBe(BILLING_MIN_GOLFERS);
  });

  it('only increases above the minimum for regular players', () => {
    const regularPlayers = Array.from({ length: 10 }, () => ({ type: 'player' }));
    expect(
      getLeagueBillableGolfers([
        ...regularPlayers,
        { type: 'sub' },
        { type: 'substitute' },
        { type: 'captain' },
      ]),
    ).toBe(10);
  });

  it('keeps deleted leagues allocated so paid league capacity cannot be reused', async () => {
    findManyMock.mockResolvedValue([
      { numPlayers: 8, players: [] },
      { numPlayers: 10, players: [] },
    ]);

    await expect(getAllocatedGolfersForAdmin(7)).resolves.toBe(18);
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { adminId: 7 } }),
    );
  });
});
