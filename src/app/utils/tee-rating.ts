export type Gender = 'male' | 'female';
export type RoundSide = 'front' | 'back';

export type TeeHole = {
  num: number;
  par: number;
  hcp: number;
  dis?: number;
};

export type TeeRatingSource = {
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
};

export type RoundTee = {
  slope: number;
  rating: number;
  par: number;
  holes: TeeHole[];
  holesPlayed: 9 | 18;
  gender: Gender;
  side: RoundSide;
  isNineHoleCourse: boolean;
};

const positiveNumber = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
};

const normalizeHole = (hole: unknown): TeeHole | null => {
  if (!hole || typeof hole !== 'object') return null;
  const value = hole as Record<string, unknown>;
  const num = Number(value.num ?? value.hole);
  const par = Number(value.par);
  const hcp = Number(value.hcp ?? value.handicap);
  if (!Number.isInteger(num) || num <= 0 || !Number.isFinite(par) || par <= 0) return null;

  return {
    num,
    par,
    hcp: Number.isFinite(hcp) && hcp > 0 ? hcp : num,
    ...(Number.isFinite(Number(value.dis)) ? { dis: Number(value.dis) } : {}),
  };
};

export const normalizeGender = (value: unknown): Gender => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'male' || normalized === 'men') return 'male';
  if (normalized === 'female' || normalized === 'women') return 'female';
  throw new Error('Player gender must be male or female.');
};

const normalizeRoundSide = (value: unknown): RoundSide => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'front' || normalized === 'back') return normalized;
  throw new Error('Starting side must be front or back.');
};

export const getCourseHoleCount = (courseHoles: unknown, tee: TeeRatingSource) => {
  const declared = Number(courseHoles);
  if (Number.isInteger(declared) && declared > 0) return declared;
  return Array.isArray(tee.holes) ? tee.holes.length : 0;
};

export const selectRoundHoles = (
  tee: TeeRatingSource,
  courseHoles: unknown,
  roundHoles: unknown,
  startSide: unknown,
) => {
  const holesPlayed = Number(roundHoles);
  if (holesPlayed !== 9 && holesPlayed !== 18) {
    throw new Error('Events must be configured for 9 or 18 holes.');
  }

  const allHoles = (Array.isArray(tee.holes) ? tee.holes : [])
    .map(normalizeHole)
    .filter((hole): hole is TeeHole => hole !== null)
    .sort((left, right) => left.num - right.num);
  const courseHoleCount = getCourseHoleCount(courseHoles, tee);
  const isNineHoleCourse = courseHoleCount <= 9;

  if (isNineHoleCourse && holesPlayed === 18) {
    throw new Error('A 9-hole course can only be used for a 9-hole event.');
  }

  const side = isNineHoleCourse ? 'front' : normalizeRoundSide(startSide);
  const holes =
    holesPlayed === 18 || isNineHoleCourse
      ? allHoles.slice(0, holesPlayed)
      : allHoles.filter((hole) => (side === 'front' ? hole.num <= 9 : hole.num > 9));

  if (holes.length !== holesPlayed) {
    throw new Error(`Selected tee must contain exactly ${holesPlayed} scoreable holes.`);
  }

  return { holes, holesPlayed: holesPlayed as 9 | 18, side, isNineHoleCourse };
};

const getGenderValues = (tee: TeeRatingSource, gender: Gender) =>
  gender === 'female'
    ? {
        fullSlope: positiveNumber(tee.slopeWomen),
        frontSlope: positiveNumber(tee.slopeFrontWomen),
        backSlope: positiveNumber(tee.slopeBackWomen),
        fullRating: positiveNumber(tee.ratingWomen),
        frontRating: positiveNumber(tee.ratingFrontWomen),
        backRating: positiveNumber(tee.ratingBackWomen),
      }
    : {
        fullSlope: positiveNumber(tee.slopeMen),
        frontSlope: positiveNumber(tee.slopeFrontMen),
        backSlope: positiveNumber(tee.slopeBackMen),
        fullRating: positiveNumber(tee.ratingMen),
        frontRating: positiveNumber(tee.ratingFrontMen),
        backRating: positiveNumber(tee.ratingBackMen),
      };

export const modelTeeForRound = (
  tee: TeeRatingSource,
  numHoles: number,
  startSide: unknown,
  options: { courseHoles?: unknown; gender?: unknown } = {},
): RoundTee => {
  const gender = normalizeGender(options.gender ?? 'male');
  const selection = selectRoundHoles(tee, options.courseHoles, numHoles, startSide);
  const values = getGenderValues(tee, gender);

  const slope = selection.isNineHoleCourse
    ? values.fullSlope ?? values.frontSlope
    : selection.holesPlayed === 18
      ? values.fullSlope
      : selection.side === 'front'
        ? values.frontSlope
        : values.backSlope;
  const rating = selection.isNineHoleCourse
    ? values.fullRating ?? values.frontRating
    : selection.holesPlayed === 18
      ? values.fullRating
      : selection.side === 'front'
        ? values.frontRating
        : values.backRating;
  const par = selection.isNineHoleCourse
    ? positiveNumber(tee.par) ?? positiveNumber(tee.frontPar)
    : selection.holesPlayed === 18
      ? positiveNumber(tee.par)
      : positiveNumber(selection.side === 'front' ? tee.frontPar : tee.backPar);

  if (slope == null || rating == null || par == null) {
    const label = gender === 'female' ? "women's" : "men's";
    throw new Error(`Selected tee is missing the required ${label} rating, slope, or par.`);
  }

  return {
    slope,
    rating,
    par,
    holes: selection.holes,
    holesPlayed: selection.holesPlayed,
    gender,
    side: selection.side,
    isNineHoleCourse: selection.isNineHoleCourse,
  };
};

const roundHalfUp = (value: number) =>
  value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);

const roundToOneDecimal = (value: number) => roundHalfUp(value * 10) / 10;

export const calculateCourseHandicap = (
  handicapIndex: number,
  tee: RoundTee,
  handicapHoleBasis: 9 | 18 = 18,
) => {
  const index = Number(handicapIndex);
  if (!Number.isFinite(index)) throw new Error('A valid Handicap Index is required.');
  if (handicapHoleBasis === 9 && tee.holesPlayed !== 9) {
    throw new Error('A 9-hole handicap can only be used for a 9-hole round.');
  }
  const adjustedIndex =
    tee.holesPlayed === 9 && handicapHoleBasis === 18 ? roundToOneDecimal(index / 2) : index;
  return roundHalfUp(adjustedIndex * (tee.slope / 113) + (tee.rating - tee.par));
};

export const calculateStrokePops = (courseHandicap: number, holes: TeeHole[]) => {
  const sorted = [...holes].sort((left, right) => left.hcp - right.hcp);
  const pops = new Map<number, number>();
  let remaining = Math.abs(Math.round(courseHandicap));
  const direction = courseHandicap < 0 ? -1 : 1;
  let index = 0;

  while (remaining > 0 && sorted.length > 0) {
    const hole = sorted[index % sorted.length];
    pops.set(hole.num, (pops.get(hole.num) || 0) + direction);
    remaining -= 1;
    index += 1;
  }

  return pops;
};

export const calculateMatchPops = (
  leftCourseHandicap: number,
  rightCourseHandicap: number,
  holes: TeeHole[],
) => {
  const baseline = Math.min(leftCourseHandicap, rightCourseHandicap);
  return [
    calculateStrokePops(leftCourseHandicap - baseline, holes),
    calculateStrokePops(rightCourseHandicap - baseline, holes),
  ] as const;
};

// The USGA expected-score lookup is not published as a reusable table. Keep the
// approximation centralized so every 9-hole entry is normalized identically.
export const calculateExpectedNineHoleDifferential = (handicapIndex: number) =>
  roundToOneDecimal(Number(handicapIndex) / 2 + 1.5);

export const calculateRoundDifferential = (
  adjustedScore: number,
  tee: RoundTee,
  handicapIndex: number,
  handicapHoleBasis: 9 | 18 = 18,
) => {
  if (handicapHoleBasis === 9 && tee.holesPlayed !== 9) {
    throw new Error('A 9-hole handicap can only be calculated from a 9-hole round.');
  }
  const playedDifferential = ((Number(adjustedScore) - tee.rating) * 113) / tee.slope;
  const normalized =
    tee.holesPlayed === 9 && handicapHoleBasis === 18
      ? playedDifferential + calculateExpectedNineHoleDifferential(handicapIndex)
      : playedDifferential;
  return Number(normalized.toFixed(2));
};
