import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Round } from '../services/round';

const holes = Array.from({ length: 9 }, (_, index) => ({
  num: index + 1,
  hcp: index + 1,
  par: 4,
}));

const event = {
  id: 99,
  courseId: 1,
  teeId: 2,
  holes: 9,
  startSide: 'front',
  date: new Date('2026-04-16T12:00:00.000Z'),
  scoringFormat: 'match',
  isDeleted: false,
  deletedAt: null,
  tee: {
    slopeFrontMen: 120,
    slopeBackMen: 120,
    slopeMen: 120,
    ratingFrontMen: 36,
    ratingBackMen: 36,
    ratingMen: 72,
    par: 72,
    frontPar: 36,
    backPar: 36,
    holes,
  },
};

const scores = Object.fromEntries(holes.map((hole) => [hole.num, 4]));

const buildDb = () => {
  const db: any = {
    event: { findFirst: vi.fn().mockResolvedValue(event) },
    player: {
      findFirst: vi.fn().mockResolvedValue({ id: 1, handicap: 10, deletedAt: null }),
      findUnique: vi.fn().mockResolvedValue({ id: 1, handicap: 10, rounds: [] }),
      update: vi.fn().mockResolvedValue({}),
    },
    round: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 11, adjusted: 36 }),
      update: vi.fn().mockResolvedValue({ id: 11, adjusted: 36, preHandicap: 10 }),
    },
    score: {
      createMany: vi.fn().mockResolvedValue({ count: 9 }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  return db;
};

describe('Round service', () => {
  let db: ReturnType<typeof buildDb>;

  beforeEach(() => {
    db = buildDb();
  });

  it('uses the current handicap when creating a round', async () => {
    await new Round(99, { playerId: 1, opponentId: 2, scores, points: 3 }, undefined, db).process();

    expect(db.round.create).toHaveBeenCalledTimes(1);
    const createdScores = db.score.createMany.mock.calls[0][0].data;
    expect(createdScores.find((score: any) => score.hole === 1).net).toBe(2);
    expect(db.round.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: expect.objectContaining({ preHandicap: 10 }),
    });
  });

  it('uses the original pre-handicap when editing a round', async () => {
    const existingRound = { id: 12, adjusted: 36, preHandicap: 0 };
    db.round.findUnique.mockResolvedValue(existingRound);
    db.round.update.mockResolvedValue(existingRound);

    await new Round(99, { playerId: 1, opponentId: 2, scores }, existingRound, db).process();

    expect(db.score.update).toHaveBeenCalledTimes(9);
    expect(db.score.update.mock.calls[0][0].data.net).toBe(4);
    expect(db.round.update).toHaveBeenLastCalledWith({
      where: { id: 12 },
      data: expect.objectContaining({ preHandicap: 0 }),
    });
  });

  it('rejects missing or extra hole scores before writing a round', async () => {
    await expect(
      new Round(99, { playerId: 1, scores: { 1: 4, 10: 4 } }, undefined, db).process(),
    ).rejects.toThrow('one valid stroke total for every hole');

    expect(db.round.create).not.toHaveBeenCalled();
    expect(db.score.createMany).not.toHaveBeenCalled();
  });
});
