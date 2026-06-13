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
  it('falls back to full-course slope and half full-course rating for 9-hole rounds', () => {
    const modeledTee = modelTeeForRound(tee, 9, 'front');

    expect(modeledTee.slope).toBe(128);
    expect(modeledTee.rating).toBe(36.2);
    expect(modeledTee.par).toBe(0);
    expect(modeledTee.holes).toHaveLength(9);
    expect(modeledTee.holes[0].num).toBe(1);
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
});
