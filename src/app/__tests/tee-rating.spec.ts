import { describe, expect, it } from 'vitest';
import { modelTeeForRound } from '../utils/tee-rating';

const tee = {
  slopeMen: 128,
  slopeFrontMen: 0,
  slopeBackMen: 0,
  ratingMen: 72.4,
  ratingFrontMen: 0,
  ratingBackMen: 0,
  par: 72,
  frontPar: 0,
  backPar: 0,
  holes: Array.from({ length: 18 }, (_, index) => ({ num: index + 1 })),
};

describe('modelTeeForRound', () => {
  it('requires side-specific rating and slope for 9-hole rounds', () => {
    expect(() => modelTeeForRound(tee, 9, 'front')).toThrow(
      'Missing tee rating or slope for handicap calculation',
    );
  });

  it('requires front or back starting side for 9-hole rounds', () => {
    expect(() =>
      modelTeeForRound(
        {
          ...tee,
          slopeFrontMen: 121,
          ratingFrontMen: 35.9,
        },
        9,
        '',
      ),
    ).toThrow('Missing or invalid starting side for 9-hole handicap calculation');
  });

  it('uses side-specific rating and slope when available', () => {
    const modeledTee = modelTeeForRound(
      {
        ...tee,
        slopeBackMen: 124,
        ratingBackMen: 35.7,
        backPar: 35,
      },
      9,
      'back',
    );

    expect(modeledTee.slope).toBe(124);
    expect(modeledTee.rating).toBe(35.7);
    expect(modeledTee.par).toBe(35);
    expect(modeledTee.holes).toHaveLength(9);
    expect(modeledTee.holes[0].num).toBe(10);
  });

  it('uses front-nine rating and slope for front 9-hole rounds', () => {
    const modeledTee = modelTeeForRound(
      {
        ...tee,
        slopeFrontMen: 121,
        ratingFrontMen: 35.9,
        frontPar: 36,
      },
      9,
      'front',
    );

    expect(modeledTee.slope).toBe(121);
    expect(modeledTee.rating).toBe(35.9);
    expect(modeledTee.par).toBe(36);
    expect(modeledTee.holes).toHaveLength(9);
    expect(modeledTee.holes[0].num).toBe(1);
  });

  it('uses full-course rating and slope for 18-hole rounds', () => {
    const modeledTee = modelTeeForRound(
      {
        ...tee,
        slopeFrontMen: 121,
        ratingFrontMen: 35.9,
        frontPar: 36,
      },
      18,
      'front',
    );

    expect(modeledTee.slope).toBe(128);
    expect(modeledTee.rating).toBe(72.4);
    expect(modeledTee.par).toBe(72);
    expect(modeledTee.holes).toHaveLength(18);
  });
});
