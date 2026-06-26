type StartSide = 'front' | 'back' | string;

const positiveNumber = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
};

export const modelTeeForRound = (tee: any, numHoles: number, startSide: StartSide) => {
  const isNineHoleRound = Number(numHoles) === 9;
  const side = String(startSide || '').toLowerCase();
  if (isNineHoleRound && side !== 'front' && side !== 'back') {
    throw new Error('Missing or invalid starting side for 9-hole handicap calculation');
  }

  const isFront = side === 'front';

  const fullSlope = positiveNumber(tee?.slopeMen);
  const fullRating = positiveNumber(tee?.ratingMen);
  const sideSlope = positiveNumber(isFront ? tee?.slopeFrontMen : tee?.slopeBackMen);
  const sideRating = positiveNumber(isFront ? tee?.ratingFrontMen : tee?.ratingBackMen);

  const slope = isNineHoleRound ? sideSlope : fullSlope;
  const rating = isNineHoleRound ? sideRating : fullRating;
  const par = isNineHoleRound
    ? positiveNumber(isFront ? tee?.frontPar : tee?.backPar)
    : positiveNumber(tee?.par);

  if (slope == null || rating == null) {
    throw new Error('Missing tee rating or slope for handicap calculation');
  }

  const sortedHoles = Array.isArray(tee?.holes)
    ? [...tee.holes].sort((a: any, b: any) => Number(a?.num ?? 0) - Number(b?.num ?? 0))
    : tee?.holes;

  const holes =
    isNineHoleRound && Array.isArray(sortedHoles)
      ? sortedHoles.filter((hole: any) => (isFront ? Number(hole?.num) <= 9 : Number(hole?.num) > 9))
      : sortedHoles;

  return {
    slope,
    rating,
    par: par ?? 0,
    holes,
  };
};
