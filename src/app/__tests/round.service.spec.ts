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
  startsAt: new Date('2026-04-16T12:00:00.000Z'),
  timeZone: 'America/Detroit',
  course: { numHoles: 18 },
  scoringMode: 'match-play',
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
      findFirst: vi.fn().mockResolvedValue({ id: 1, handicap: 10, gender: 'male', deletedAt: null }),
      findUnique: vi.fn().mockResolvedValue({ id: 1, handicap: 10, gender: 'male', rounds: [] }),
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
    expect(db.round.update).not.toHaveBeenCalled();
  });

  it('does not halve a stored 9-hole handicap for a 9-hole league', async () => {
    db.event.findFirst.mockResolvedValue({
      ...event,
      league: { holeFormat: '9' },
    });

    await new Round(99, { playerId: 1, opponentId: 2, scores, points: 3 }, undefined, db).process();

    const createdScores = db.score.createMany.mock.calls[0][0].data;
    expect(createdScores.find((score: any) => score.hole === 1).net).toBe(2);
  });

  it('uses the stored player handicap without a tee conversion', async () => {
    db.event.findFirst.mockResolvedValue({
      ...event,
      league: { holeFormat: '9' },
    });
    db.player.findFirst.mockResolvedValue({
      id: 1,
      handicap: 8.4,
      gender: 'male',
      deletedAt: null,
    });
    db.player.findUnique.mockResolvedValue({
      id: 1,
      handicap: 8.4,
      startingHandicap: 8.4,
      gender: 'male',
      rounds: [],
    });

    await new Round(99, { playerId: 1, opponentId: 2, scores, points: 3 }, undefined, db).process();

    const createdScores = db.score.createMany.mock.calls[0][0].data;
    expect(createdScores.find((score: any) => score.hole === 8).net).toBe(3);
    expect(createdScores.find((score: any) => score.hole === 9).net).toBe(4);
    expect(db.round.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ playingHandicap: 8 }),
    });
  });

  it('uses women\'s tee ratings and hole allocation for a female player', async () => {
    db.event.findFirst.mockResolvedValue({
      ...event,
      league: { holeFormat: '9' },
      tee: {
        ...event.tee,
        slopeWomen: 140,
        slopeFrontWomen: 140,
        ratingWomen: 80,
        ratingFrontWomen: 40,
        holesWomen: holes.map((hole) => ({
          ...hole,
          hcp: 10 - hole.hcp,
          par: hole.num === 1 ? 5 : 4,
        })),
      },
    });
    db.player.findFirst.mockResolvedValue({
      id: 1,
      handicap: 8,
      startingHandicap: 8,
      gender: 'female',
      deletedAt: null,
    });
    db.player.findUnique.mockResolvedValue({
      id: 1,
      handicap: 8,
      startingHandicap: 8,
      gender: 'female',
      rounds: [],
    });

    await new Round(99, { playerId: 1, scores }, undefined, db).process();

    const createdScores = db.score.createMany.mock.calls[0][0].data;
    expect(createdScores.find((score: any) => score.hole === 1)).toMatchObject({ par: 5, net: 4 });
    expect(createdScores.find((score: any) => score.hole === 9)).toMatchObject({ par: 4, net: 3 });
    expect(db.round.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        playingHandicap: 8,
        courseRating: 40,
        courseSlope: 140,
      }),
    });
  });

  it('scores both selected nines with the combined route handicap', async () => {
    const northTee = {
      ...event.tee,
      id: 21,
      ratingMen: 35.2,
      slopeMen: 121,
      holes,
    };
    const southTee = {
      ...event.tee,
      id: 22,
      ratingMen: 36.1,
      slopeMen: 127,
      holes: holes.map((hole) => ({ ...hole, par: hole.num === 5 ? 5 : 4 })),
    };
    db.event.findFirst.mockResolvedValue({
      ...event,
      holes: 18,
      course: { id: 1, numHoles: 9 },
      tee: northTee,
      league: { holeFormat: '18' },
      routeSegments: [
        { position: 0, courseId: 1, teeId: 21, course: { id: 1, numHoles: 9 }, tee: northTee },
        { position: 1, courseId: 2, teeId: 22, course: { id: 2, numHoles: 9 }, tee: southTee },
      ],
    });
    db.round.create.mockResolvedValue({ id: 11, adjusted: 73 });
    db.round.update.mockResolvedValue({ id: 11, adjusted: 73, preHandicap: 10 });
    const routeScores = Object.fromEntries(
      Array.from({ length: 18 }, (_, index) => [index + 1, 4]),
    );

    await new Round(99, { playerId: 1, scores: routeScores }, undefined, db).process();

    const createdScores = db.score.createMany.mock.calls[0][0].data;
    expect(createdScores).toHaveLength(18);
    expect(createdScores[0]).toMatchObject({ hole: 1, gross: 4, net: 3 });
    expect(createdScores[9]).toMatchObject({ hole: 10, gross: 4, net: 3 });
    expect(db.round.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        courseRating: 71.3,
        courseSlope: 124,
        playingHandicap: 10,
      }),
    });
  });

  it('uses the original pre-handicap when editing a round', async () => {
    const existingRound = { id: 12, adjusted: 36, preHandicap: 0 };
    db.round.findUnique.mockResolvedValue(existingRound);
    db.round.update.mockResolvedValue(existingRound);

    await new Round(99, { playerId: 1, opponentId: 2, scores }, existingRound, db).process();

    expect(db.score.update).toHaveBeenCalledTimes(9);
    expect(db.score.update.mock.calls[0][0].data.net).toBe(4);
    expect(db.round.update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: expect.objectContaining({ playingHandicap: 0 }),
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
