/* ============================================
   USGA / WHS Handicap Calculation (Full)
   ============================================ */

/* ---------- Types ---------- */

export type Round = {
  adjustedGrossScore: number;
  courseRating: number;
  slopeRating: number;
  date: Date;
};

export type HandicapState = {
  rounds: Round[]; // Most recent rounds first
  previousIndex?: number; // Undefined for new players
};

/* ---------- Utilities ---------- */

function roundToOneDecimal(value: number): number {
  return Number(value.toFixed(1));
}

/* ---------- Differential ---------- */

function calculateDifferential(adjustedScore: number, courseRating: number, slope: number): number {
  return roundToOneDecimal(((adjustedScore - courseRating) * 113) / slope);
}

/* ---------- Rounds-To-Use Table ---------- */

function getRoundsToUse(roundCount: number): {
  count: number;
  adjustment: number;
} | null {
  if (roundCount < 3) return null;

  if (roundCount === 3) return { count: 1, adjustment: -2 };
  if (roundCount === 4) return { count: 1, adjustment: -1 };
  if (roundCount === 5) return { count: 1, adjustment: 0 };
  if (roundCount <= 8) return { count: 2, adjustment: 0 };
  if (roundCount <= 11) return { count: 3, adjustment: 0 };
  if (roundCount <= 14) return { count: 4, adjustment: 0 };
  if (roundCount <= 16) return { count: 5, adjustment: 0 };
  if (roundCount <= 18) return { count: 6, adjustment: 0 };
  if (roundCount === 19) return { count: 7, adjustment: 0 };

  return { count: 8, adjustment: 0 };
}

/* ---------- Exceptional Score Adjustment ---------- */

function applyExceptionalScoreAdjustment(index: number, lowestDifferentials: number[]): number {
  const lowest = Math.min(...lowestDifferentials);

  if (lowest <= index - 10) return index - 2;
  if (lowest <= index - 7) return index - 1;

  return index;
}

/* ---------- Soft & Hard Caps ---------- */

function applyCaps(newIndex: number, previousIndex: number): number {
  const increase = newIndex - previousIndex;

  // Soft cap: limit increase beyond +3.0 by 50%
  if (increase > 3) {
    newIndex = previousIndex + 3 + (increase - 3) * 0.5;
  }

  // Hard cap: max +5.0
  if (newIndex > previousIndex + 5) {
    newIndex = previousIndex + 5;
  }

  return roundToOneDecimal(newIndex);
}

/* ---------- Handicap Index (MAIN ENTRY POINT) ---------- */

export function calculateHandicapIndex(state: HandicapState): number | null {
  const { rounds, previousIndex } = state;

  if (rounds.length < 3) return null;

  // 1. Calculate differentials
  const differentials = rounds.map((r) =>
    calculateDifferential(r.adjustedGrossScore, r.courseRating, r.slopeRating)
  );

  // 2. Determine how many to use
  const rule = getRoundsToUse(differentials.length);
  if (!rule) return null;

  const lowestDifferentials = [...differentials].sort((a, b) => a - b).slice(0, rule.count);

  // 3. Average + early-round adjustment
  let index =
    lowestDifferentials.reduce((sum, d) => sum + d, 0) / lowestDifferentials.length +
    rule.adjustment;

  index = roundToOneDecimal(index);

  // 4. Exceptional score adjustment
  index = applyExceptionalScoreAdjustment(index, lowestDifferentials);

  // 5. Apply caps (if applicable)
  if (previousIndex !== undefined) {
    index = applyCaps(index, previousIndex);
  }

  return roundToOneDecimal(index);
}

/* ---------- Course Handicap ---------- */
export function calculateCourseHandicap(
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  par: number
): number {
  return Math.round(handicapIndex * (slopeRating / 113) + (courseRating - par));
}
