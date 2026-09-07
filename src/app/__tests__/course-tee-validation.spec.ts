import { describe, expect, it } from 'vitest';
import {
  CourseTeeValidationError,
  validateCourseTeeData,
} from '../utils/course-tee-validation';

const buildNineHoleTee = () => {
  const holes = Array.from({ length: 9 }, (_, index) => ({
    num: index + 1,
    par: 4,
    dis: 350,
    hcp: index + 1,
  }));

  return {
    name: 'Blue',
    color: '#2563eb',
    distance: 3150,
    par: 36,
    frontPar: 36,
    backPar: 0,
    holes,
    holesWomen: holes.map((hole) => ({ ...hole })),
  };
};

describe('course tee validation', () => {
  it('accepts a complete nine-hole tee without invented rating data', () => {
    expect(() =>
      validateCourseTeeData({
        numHoles: 9,
        par: 36,
        tees: [buildNineHoleTee()],
      }),
    ).not.toThrow();
  });

  it('requires rating and slope values to be entered together', () => {
    expect(() =>
      validateCourseTeeData({
        numHoles: 9,
        par: 36,
        tees: [{ ...buildNineHoleTee(), ratingMen: 35.7 }],
      }),
    ).toThrow(CourseTeeValidationError);
  });

  it('rejects duplicate handicap ranks', () => {
    const tee = buildNineHoleTee();
    tee.holes[1].hcp = 1;

    expect(() => validateCourseTeeData({ numHoles: 9, par: 36, tees: [tee] })).toThrow(
      'handicap ranks must use each number from 1 to 9 once',
    );
  });
});
