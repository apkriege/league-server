import { describe, expect, it } from 'vitest';
import {
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

  it('uses the women\'s scorecard when the provider supplies different hole data', () => {
    const modeled = modelTeeForRound(
      {
        ...tee,
        holesWomen: holes.map((hole) => ({
          ...hole,
          par: hole.num === 1 ? 5 : hole.par,
          hcp: 19 - hole.hcp,
        })),
      },
      9,
      'front',
      { courseHoles: 18, gender: 'female' },
    );

    expect(modeled.par).toBe(37);
    expect(modeled.holes[0]).toMatchObject({ num: 1, par: 5, hcp: 18 });
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
      isRepeatedNine: false,
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

  it('models an 18-hole round as two independent loops of a true 9-hole course', () => {
    const modeled = modelTeeForRound(
      {
        ...tee,
        holes: holes.slice(0, 9),
        par: 36,
        ratingMen: 34.5,
        slopeMen: 121,
      },
      18,
      'front',
      {
        courseHoles: 9,
        gender: 'male',
      },
    );

    expect(modeled).toMatchObject({
      rating: 69,
      slope: 121,
      par: 72,
      isNineHoleCourse: true,
      isRepeatedNine: true,
    });
    expect(modeled.holes).toHaveLength(18);
    expect(modeled.holes.slice(0, 3).map((hole) => hole.hcp)).toEqual([1, 3, 5]);
    expect(modeled.holes.slice(9, 12).map((hole) => hole.hcp)).toEqual([2, 4, 6]);
    expect(modeled.holes[9]).toMatchObject({ num: 10, par: holes[0].par });
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
  it('uses the nine-hole slope and doubled rating/par for an 18-hole repeated-nine round', () => {
    const modeled = modelTeeForRound(
      {
        ...tee,
        holes: holes.slice(0, 9),
        ratingMen: 34.5,
        slopeMen: 121,
      },
      18,
      'front',
      { courseHoles: 9, gender: 'male' },
    );

    expect(calculateRoundDifferential(80, modeled, 10)).toBe(10.27);
  });

  it('keeps a 9-hole league handicap on its native scale for a repeated-nine event', () => {
    const modeled = modelTeeForRound(
      {
        ...tee,
        holes: holes.slice(0, 9),
        ratingMen: 34.5,
        slopeMen: 121,
      },
      18,
      'front',
      { courseHoles: 9, gender: 'male' },
    );

    expect(calculateRoundDifferential(80, modeled, 5, 9)).toBe(5.14);
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

  it('allocates strokes directly from player handicaps', () => {
    const nineHoles = holes.slice(0, 9);
    expect([...calculateStrokePops(4, nineHoles).entries()]).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
    ]);

    expect([...calculateStrokePops(-2, nineHoles).entries()]).toEqual([
      [9, -1],
      [8, -1],
    ]);
  });
});
