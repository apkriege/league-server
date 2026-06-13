"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.modelTeeForRound = void 0;
const positiveNumber = (value) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
};
const modelTeeForRound = (tee, numHoles, startSide) => {
    const isNineHoleRound = Number(numHoles) === 9;
    const isFront = startSide === 'front';
    const fullSlope = positiveNumber(tee?.slopeMen);
    const fullRating = positiveNumber(tee?.ratingMen);
    const sideSlope = positiveNumber(isFront ? tee?.slopeFrontMen : tee?.slopeBackMen);
    const sideRating = positiveNumber(isFront ? tee?.ratingFrontMen : tee?.ratingBackMen);
    const slope = isNineHoleRound ? sideSlope ?? fullSlope : fullSlope;
    // 9-hole rating fallback uses half of the full 18-hole course rating. Slope stays full-course.
    const rating = isNineHoleRound ? sideRating ?? (fullRating != null ? fullRating / 2 : null) : fullRating;
    const par = isNineHoleRound
        ? positiveNumber(isFront ? tee?.frontPar : tee?.backPar)
        : positiveNumber(tee?.par);
    if (slope == null || rating == null) {
        throw new Error('Missing tee rating or slope for handicap calculation');
    }
    const holes = isNineHoleRound && Array.isArray(tee?.holes)
        ? isFront
            ? tee.holes.slice(0, 9)
            : tee.holes.slice(9, 18)
        : tee?.holes;
    return {
        slope,
        rating,
        par: par ?? 0,
        holes,
    };
};
exports.modelTeeForRound = modelTeeForRound;
