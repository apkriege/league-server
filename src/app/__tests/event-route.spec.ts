import { describe, expect, it } from 'vitest';
import { calculateRoundDifferential } from '../utils/tee-rating';
import {
  buildEventRouteSnapshot,
  getEventRouteLabel,
  getEventTeeId,
  modelEventTeeForRound,
} from '../utils/event-route';

const makeSegment = (
  courseId: number,
  teeId: number,
  name: string,
  rating: number,
  slope: number,
) => ({
  courseId,
  teeId,
  course: { id: courseId, name, numHoles: 9 },
  tee: {
    id: teeId,
    name: 'Blue',
    ratingMen: rating,
    slopeMen: slope,
    holes: Array.from({ length: 9 }, (_, index) => ({
      num: index + 1,
      par: index === 4 ? 5 : 4,
      hcp: index + 1,
      dis: 320 + index,
    })),
  },
});

describe('event course routes', () => {
  it('combines two named nines in their selected order', () => {
    const event = {
      holes: 18,
      startSide: 'front',
      routeSegments: [
        { ...makeSegment(1, 11, 'North', 35.2, 121), position: 0 },
        { ...makeSegment(2, 22, 'South', 36.1, 127), position: 1 },
      ],
    };
    const modeled = modelEventTeeForRound(event, 'male');

    expect(getEventRouteLabel(event)).toBe('North → South');
    expect(modeled).toMatchObject({ rating: 71.3, slope: 124, par: 74, holesPlayed: 18 });
    expect(modeled.holes[0]).toMatchObject({ num: 1, hcp: 1 });
    expect(modeled.holes[9]).toMatchObject({ num: 10, hcp: 2 });
    expect(calculateRoundDifferential(82, modeled, 10)).toBe(9.75);
  });

  it('supports selecting the same physical nine twice', () => {
    const segment = makeSegment(1, 11, 'North', 35.2, 121);
    const modeled = modelEventTeeForRound({
      holes: 18,
      startSide: 'front',
      routeSegments: [
        { ...segment, position: 0 },
        { ...segment, position: 1 },
      ],
    }, 'male');

    expect(modeled).toMatchObject({ rating: 70.4, slope: 121, isRepeatedNine: true });
  });

  it('keeps event scoring immutable when live course tees are edited later', () => {
    const originalSegments = [
      { ...makeSegment(1, 11, 'North', 35.2, 121), position: 0 },
      { ...makeSegment(2, 22, 'South', 36.1, 127), position: 1 },
    ];
    const event = {
      holes: 18,
      startSide: 'front',
      routeSnapshot: buildEventRouteSnapshot(originalSegments),
      routeSegments: originalSegments.map((segment) => ({
        ...segment,
        tee: { ...segment.tee, ratingMen: 40, slopeMen: 155 },
      })),
    };

    expect(modelEventTeeForRound(event, 'male')).toMatchObject({
      rating: 71.3,
      slope: 124,
      par: 74,
    });
  });
});


describe('gender-specific event tees', () => {
  const men = makeSegment(1, 11, 'North', 35, 120);
  const womenTee = {
    ...men.tee, id: 12, name: 'Red', ratingWomen: 36, slopeWomen: 125,
    holesWomen: men.tee.holes.map((hole) => ({ ...hole, par: 5, dis: 250 })),
  };
  it('selects and freezes independent scorecards and ratings', () => {
    const snapshot = buildEventRouteSnapshot([{ ...men, womenTeeId: 12, womenTee }]);
    const event = { holes: 9, startSide: 'front', routeSnapshot: snapshot };
    womenTee.holesWomen[0].par = 3;
    expect(getEventTeeId(event, 'male')).toBe(11);
    expect(getEventTeeId(event, 'female')).toBe(12);
    expect(modelEventTeeForRound(event, 'male')).toMatchObject({ rating: 35, slope: 120, par: 37 });
    expect(modelEventTeeForRound(event, 'female')).toMatchObject({ rating: 36, slope: 125, par: 45 });
  });
  it('combines or repeats the selected women’s nines', () => {
    const segment = { ...men, womenTeeId: 12, womenTee };
    const event = { holes: 18, startSide: 'front', routeSnapshot: buildEventRouteSnapshot([segment, segment]) };
    expect(modelEventTeeForRound(event, 'female')).toMatchObject({ rating: 72, slope: 125, isRepeatedNine: true });
  });
  it('preserves legacy events using gender ratings on a single tee', () => {
    const event = { holes: 9, startSide: 'front', routeSegments: [{ ...men, tee: { ...men.tee, ratingWomen: 36, slopeWomen: 125 } }] };
    expect(getEventTeeId(event, 'female')).toBe(11);
    expect(modelEventTeeForRound(event, 'female').rating).toBe(36);
  });
});

describe('handicap modeling from explicit event tee fields', () => {
  const men = makeSegment(1, 11, 'North', 35, 113);
  const menTee = { ...men.tee, ratingWomen: 37, slopeWomen: 113 };
  const womenTee = { ...menTee, id: 12, ratingWomen: 38, slopeWomen: 113,
    holesWomen: menTee.holes.map((hole) => ({ ...hole, hcp: 10 - hole.hcp })),
  };
  const event = { holes: 9, startSide: 'front', courseId: 1, course: men.course,
    menTeeId: 11, menTee, womenTeeId: 12, womenTee,
  };

  it('uses the selected tee and gender ratings for each differential without a snapshot', () => {
    const male = modelEventTeeForRound(event, 'male');
    const female = modelEventTeeForRound(event, 'female');
    expect(getEventTeeId(event, 'male')).toBe(11);
    expect(getEventTeeId(event, 'female')).toBe(12);
    expect(calculateRoundDifferential(45, male, 11, 9)).toBe(10);
    expect(calculateRoundDifferential(45, female, 11, 9)).toBe(7);
    expect(female.holes[0].hcp).toBe(9);
  });

  it('uses women’s ratings on the men’s selection when womenTeeId is null', () => {
    const shared = { ...event, womenTeeId: null, womenTee: null };
    expect(getEventTeeId(shared, 'female')).toBe(11);
    expect(calculateRoundDifferential(45, modelEventTeeForRound(shared, 'female'), 11, 9)).toBe(8);
  });

  it('freezes both selected tee ratings when course data changes', () => {
    const routeSnapshot = buildEventRouteSnapshot([{ ...event, position: 0 }]);
    expect(routeSnapshot.segments[0]).toMatchObject({ menTeeId: 11, womenTeeId: 12 });
    const changed = { ...event, routeSnapshot,
      menTee: { ...menTee, ratingMen: 40 }, womenTee: { ...womenTee, ratingWomen: 42 },
    };
    expect(modelEventTeeForRound(changed, 'male').rating).toBe(35);
    expect(modelEventTeeForRound(changed, 'female').rating).toBe(38);
  });

  it('models different women’s tees on each nine and normalizes the differential', () => {
    const south = makeSegment(2, 21, 'South', 36, 113);
    const combined = { holes: 18, startSide: 'front', routeSegments: [
      { courseId: 1, course: men.course, position: 0, menTeeId: 11, menTee, womenTeeId: 12, womenTee },
      { courseId: 2, course: south.course, position: 1, menTeeId: 21, menTee: south.tee,
        womenTeeId: 22, womenTee: { ...womenTee, id: 22, ratingWomen: 39 } },
    ] };
    const female = modelEventTeeForRound(combined, 'female');
    expect(female).toMatchObject({ rating: 77, slope: 113, holesPlayed: 18, isRepeatedNine: false });
    expect(calculateRoundDifferential(90, female, 11, 18)).toBe(13);
    expect(calculateRoundDifferential(90, female, 11, 9)).toBe(6.5);
  });
});
