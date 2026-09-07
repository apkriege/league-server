import { describe, expect, it } from 'vitest';
import { calculateRoundDifferential } from '../utils/tee-rating';
import {
  buildEventRouteSnapshot,
  getEventRouteLabel,
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
