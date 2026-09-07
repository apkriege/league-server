type HoleInput = {
  num?: unknown;
  par?: unknown;
  dis?: unknown;
  hcp?: unknown;
};

type TeeInput = {
  name?: unknown;
  color?: unknown;
  distance?: unknown;
  par?: unknown;
  frontPar?: unknown;
  backPar?: unknown;
  slopeMen?: unknown;
  slopeFrontMen?: unknown;
  slopeBackMen?: unknown;
  slopeWomen?: unknown;
  slopeFrontWomen?: unknown;
  slopeBackWomen?: unknown;
  ratingMen?: unknown;
  ratingFrontMen?: unknown;
  ratingBackMen?: unknown;
  ratingWomen?: unknown;
  ratingFrontWomen?: unknown;
  ratingBackWomen?: unknown;
  holes?: unknown;
  holesWomen?: unknown;
};

export class CourseTeeValidationError extends Error {}

const optionalNumber = (value: unknown) =>
  value === null || value === undefined || value === '' ? null : Number(value);

const requireInteger = (value: unknown, label: string, minimum: number, maximum: number) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new CourseTeeValidationError(`${label} must be a whole number from ${minimum} to ${maximum}.`);
  }
  return parsed;
};

const validateRatingPair = (
  ratingRaw: unknown,
  slopeRaw: unknown,
  label: string,
  ratingRange: readonly [number, number],
) => {
  const rating = optionalNumber(ratingRaw);
  const slope = optionalNumber(slopeRaw);
  if ((rating == null) !== (slope == null)) {
    throw new CourseTeeValidationError(`${label} rating and slope must either both be entered or both be blank.`);
  }
  if (rating == null || slope == null) return;
  if (!Number.isFinite(rating) || rating < ratingRange[0] || rating > ratingRange[1]) {
    throw new CourseTeeValidationError(
      `${label} rating must be from ${ratingRange[0]} to ${ratingRange[1]}.`,
    );
  }
  if (!Number.isInteger(slope) || slope < 55 || slope > 155) {
    throw new CourseTeeValidationError(`${label} slope must be a whole number from 55 to 155.`);
  }
};

const validateHoles = (raw: unknown, holeCount: 9 | 18, label: string) => {
  if (!Array.isArray(raw) || raw.length !== holeCount) {
    throw new CourseTeeValidationError(`${label} must contain exactly ${holeCount} holes.`);
  }
  const holes = raw as HoleInput[];
  const numbers = holes.map((hole, index) =>
    requireInteger(hole?.num, `${label} hole ${index + 1} number`, 1, holeCount),
  );
  const ranks = holes.map((hole, index) =>
    requireInteger(hole?.hcp, `${label} hole ${index + 1} handicap rank`, 1, holeCount),
  );
  const expected = Array.from({ length: holeCount }, (_, index) => index + 1);
  if ([...numbers].sort((left, right) => left - right).some((value, index) => value !== expected[index])) {
    throw new CourseTeeValidationError(`${label} hole numbers must use each number from 1 to ${holeCount} once.`);
  }
  if ([...ranks].sort((left, right) => left - right).some((value, index) => value !== expected[index])) {
    throw new CourseTeeValidationError(`${label} handicap ranks must use each number from 1 to ${holeCount} once.`);
  }
  for (const [index, hole] of holes.entries()) {
    requireInteger(hole.par, `${label} hole ${index + 1} par`, 2, 7);
    requireInteger(hole.dis, `${label} hole ${index + 1} distance`, 0, 900);
  }
  return holes;
};

const sumPar = (holes: HoleInput[]) =>
  holes.reduce((total, hole) => total + Number(hole.par), 0);

export const validateCourseTeeData = ({
  numHoles: rawNumHoles,
  par: rawPar,
  tees,
}: {
  numHoles: unknown;
  par: unknown;
  tees: TeeInput[];
}) => {
  const numHoles = Number(rawNumHoles);
  if (numHoles !== 9 && numHoles !== 18) {
    throw new CourseTeeValidationError(
      'A course must represent one independently playable 9-hole or 18-hole layout.',
    );
  }
  requireInteger(rawPar, 'Course par', numHoles === 9 ? 18 : 36, numHoles === 9 ? 54 : 108);
  if (!Array.isArray(tees) || tees.length === 0) {
    throw new CourseTeeValidationError('At least one tee is required.');
  }

  const teeNames = new Set<string>();
  for (const [teeIndex, tee] of tees.entries()) {
    const label = `Tee ${teeIndex + 1}`;
    const name = String(tee.name || '').trim().toLowerCase();
    if (!name) throw new CourseTeeValidationError(`${label} needs a name.`);
    if (!String(tee.color || '').trim()) {
      throw new CourseTeeValidationError(`${label} needs a color.`);
    }
    requireInteger(tee.distance, `${label} total distance`, 0, 20000);
    if (teeNames.has(name)) throw new CourseTeeValidationError(`Tee names must be unique within a course.`);
    teeNames.add(name);

    const menHoles = validateHoles(tee.holes, numHoles, `${label} men's scorecard`);
    validateHoles(tee.holesWomen, numHoles, `${label} women's scorecard`);
    const teePar = requireInteger(tee.par, `${label} par`, 18, 108);
    const frontPar = requireInteger(tee.frontPar, `${label} front par`, 18, 54);
    const backPar = requireInteger(tee.backPar, `${label} back par`, 0, 54);
    const calculatedFront = sumPar(menHoles.slice(0, 9));
    const calculatedBack = numHoles === 18 ? sumPar(menHoles.slice(9, 18)) : 0;
    if (teePar !== calculatedFront + calculatedBack) {
      throw new CourseTeeValidationError(`${label} par must equal the sum of its hole pars.`);
    }
    if (frontPar !== calculatedFront || backPar !== calculatedBack) {
      throw new CourseTeeValidationError(`${label} front/back par must match its scorecard.`);
    }

    const fullRange = numHoles === 9 ? ([20, 50] as const) : ([40, 100] as const);
    validateRatingPair(tee.ratingMen, tee.slopeMen, `${label} men's full-course`, fullRange);
    validateRatingPair(tee.ratingWomen, tee.slopeWomen, `${label} women's full-course`, fullRange);
    validateRatingPair(tee.ratingFrontMen, tee.slopeFrontMen, `${label} men's front-nine`, [20, 50]);
    validateRatingPair(tee.ratingBackMen, tee.slopeBackMen, `${label} men's back-nine`, [20, 50]);
    validateRatingPair(tee.ratingFrontWomen, tee.slopeFrontWomen, `${label} women's front-nine`, [20, 50]);
    validateRatingPair(tee.ratingBackWomen, tee.slopeBackWomen, `${label} women's back-nine`, [20, 50]);
  }
};
