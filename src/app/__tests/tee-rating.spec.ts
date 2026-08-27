import { describe, expect, it } from 'vitest';
import {
  calculateCourseHandicap,
  calculateLeaguePlayingHandicap,
  calculateMatchPops,
  calculateRoundDifferential,
  calculateStrokePops,
  modelTeeForRound,
} from '../utils/tee-rating';

const holes = Array.from({ length: 18 }, (_, index) => ({
  num: index + 1,
  par: 4,
  hcp: index + 1,
}));

const tee = {
  slopeMen: 128,
  slopeFrontMen: 121,
  slopeBackMen: 124,
  slopeWomen: 136,
  slopeFrontWomen: 132,
  slopeBackWomen: 139,
  ratingMen: 72.4,
  ratingFrontMen: 35.9,
  ratingBackMen: 36.5,
  ratingWomen: 77.2,
  ratingFrontWomen: 38.1,
  ratingBackWomen: 39.1,
  par: 72,
  frontPar: 36,
  backPar: 36,
  holes,
};

describe('modelTeeForRound', () => {
  it('uses the selected gender and front-nine values for a front-nine round', () => {
    const modeled = modelTeeForRound(tee, 9, 'front', {
      courseHoles: 18,
      gender: 'female',
    });

    expect(modeled).toMatchObject({
      slope: 132,
      rating: 38.1,
      par: 36,
      gender: 'female',
      side: 'front',
      isNineHoleCourse: false,
    });
    expect(modeled.holes.map((hole) => hole.num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('uses the selected gender and back-nine values for a back-nine round', () => {
    const modeled = modelTeeForRound(tee, 9, 'back', {
      courseHoles: 18,
      gender: 'male',
    });

    expect(modeled).toMatchObject({ slope: 124, rating: 36.5, par: 36, side: 'back' });
    expect(modeled.holes[0].num).toBe(10);
    expect(modeled.holes[8].num).toBe(18);
  });

  it('uses full gender-specific values for an 18-hole round', () => {
    const modeled = modelTeeForRound(tee, 18, 'back', {
      courseHoles: 18,
      gender: 'female',
    });

    expect(modeled).toMatchObject({ slope: 136, rating: 77.2, par: 72 });
    expect(modeled.holes).toHaveLength(18);
  });

  it('uses all holes and full values for a true 9-hole course regardless of start side', () => {
    const nineHoleTee = {
      ...tee,
      holes: holes.slice(0, 9),
      par: 36,
      frontPar: 36,
      backPar: 0,
      ratingMen: 34.5,
      slopeMen: 121,
      ratingFrontMen: 0,
      slopeFrontMen: 0,
      ratingBackMen: 0,
      slopeBackMen: 0,
    };

    const modeled = modelTeeForRound(nineHoleTee, 9, 'back', {
      courseHoles: 9,
      gender: 'male',
    });

    expect(modeled).toMatchObject({
      rating: 34.5,
      slope: 121,
      par: 36,
      side: 'front',
      isNineHoleCourse: true,
    });
    expect(modeled.holes).toHaveLength(9);
  });

  it('falls back to front values when a true 9-hole course stores no full values', () => {
    const modeled = modelTeeForRound(
      {
        ...tee,
        holes: holes.slice(0, 9),
        par: 36,
        slopeMen: 0,
        ratingMen: 0,
      },
      9,
      'front',
      { courseHoles: 9, gender: 'male' },
    );

    expect(modeled).toMatchObject({ rating: 35.9, slope: 121, par: 36 });
  });

  it('rejects an 18-hole event on a true 9-hole course', () => {
    expect(() =>
      modelTeeForRound({ ...tee, holes: holes.slice(0, 9) }, 18, 'front', {
        courseHoles: 9,
        gender: 'male',
      }),
    ).toThrow('A 9-hole course can only be used for a 9-hole event.');
  });

  it('does not silently substitute men values when women values are missing', () => {
    expect(() =>
      modelTeeForRound({ ...tee, ratingWomen: null, slopeWomen: null }, 18, 'front', {
        courseHoles: 18,
        gender: 'female',
      }),
    ).toThrow("missing the required women's rating");
  });
});

describe('round handicap calculations', () => {
  it('uses the rounded stored handicap for a same-length league round', () => {
    const modeled = modelTeeForRound({ ...tee, ratingFrontMen: 32, slopeFrontMen: 90 }, 9, 'front', {
      courseHoles: 18,
      gender: 'male',
    });

    expect(calculateLeaguePlayingHandicap(12.34, modeled, 9)).toBe(12);
  });

  it('halves an 18-hole stored handicap for a 9-hole round without a tee adjustment', () => {
    const modeled = modelTeeForRound({ ...tee, ratingFrontMen: 32, slopeFrontMen: 90 }, 9, 'front', {
      courseHoles: 18,
      gender: 'male',
    });

    expect(calculateLeaguePlayingHandicap(12.6, modeled, 18)).toBe(6);
  });

  it('calculates a 9-hole Course Handicap from half the Handicap Index', () => {
    const modeled = modelTeeForRound({ ...tee, ratingFrontMen: 35.3 }, 9, 'front', {
      courseHoles: 18,
      gender: 'male',
    });

    expect(calculateCourseHandicap(8.7, modeled)).toBe(4);
  });

  it('uses a stored 9-hole handicap directly for a 9-hole league', () => {
    const modeled = modelTeeForRound({ ...tee, ratingFrontMen: 35.3 }, 9, 'front', {
      courseHoles: 18,
      gender: 'male',
    });

    expect(calculateCourseHandicap(4.4, modeled, 9)).toBe(4);
  });

  it('calculates an 18-hole Course Handicap from the full Handicap Index', () => {
    const modeled = modelTeeForRound(tee, 18, 'front', {
      courseHoles: 18,
      gender: 'male',
    });

    expect(calculateCourseHandicap(10, modeled)).toBe(12);
  });

  it('normalizes a 9-hole differential to the 18-hole scale', () => {
    const modeled = modelTeeForRound(
      { ...tee, ratingFrontMen: 35, slopeFrontMen: 113 },
      9,
      'front',
      { courseHoles: 18, gender: 'male' },
    );

    expect(calculateRoundDifferential(42.2, modeled, 14)).toBe(15.7);
  });

  it('keeps a 9-hole differential on the 9-hole scale for a 9-hole league', () => {
    const modeled = modelTeeForRound(
      { ...tee, ratingFrontMen: 35, slopeFrontMen: 113 },
      9,
      'front',
      { courseHoles: 18, gender: 'male' },
    );

    expect(calculateRoundDifferential(42.2, modeled, 7, 9)).toBe(7.2);
  });

  it('allocates stroke and match-play pops from Course Handicaps', () => {
    const nineHoles = holes.slice(0, 9);
    expect([...calculateStrokePops(4, nineHoles).entries()]).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
    ]);

    const [left, right] = calculateMatchPops(4, 7, nineHoles);
    expect(left.size).toBe(0);
    expect([...right.entries()]).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
  });
});
