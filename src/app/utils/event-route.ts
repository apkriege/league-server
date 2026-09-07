import {
  modelTeeForRound,
  normalizeGender,
  selectRoundHoles,
  type Gender,
  type RoundTee,
  type TeeRatingSource,
} from './tee-rating';

export type EventRouteSegmentSource = {
  courseId?: unknown;
  teeId?: unknown;
  position?: unknown;
  course?: { id?: unknown; name?: unknown; numHoles?: unknown; clubId?: unknown } | null;
  tee?: (TeeRatingSource & {
    id?: unknown;
    name?: unknown;
    color?: unknown;
    distance?: unknown;
  }) | null;
};

type EventRouteSource = {
  holes?: unknown;
  startSide?: unknown;
  courseId?: unknown;
  teeId?: unknown;
  course?: EventRouteSegmentSource['course'];
  tee?: EventRouteSegmentSource['tee'];
  routeSegments?: EventRouteSegmentSource[] | null;
  routeSnapshot?: unknown;
};

type EventRouteSnapshot = {
  version: 1;
  segments: EventRouteSegmentSource[];
};

const isSnapshot = (value: unknown): value is EventRouteSnapshot => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  return snapshot.version === 1 && Array.isArray(snapshot.segments) && snapshot.segments.length > 0;
};

const copyJsonArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((entry) =>
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? { ...(entry as Record<string, unknown>) }
          : entry,
      )
    : [];

export const buildEventRouteSnapshot = (
  segments: EventRouteSegmentSource[],
): EventRouteSnapshot => ({
  version: 1,
  segments: segments.map((segment, position) => {
    const { course, tee } = requireSegment(segment, position);
    return {
      position,
      courseId: segment.courseId ?? course.id,
      teeId: segment.teeId ?? tee.id,
      course: {
        id: course.id,
        name: course.name,
        numHoles: course.numHoles,
        clubId: course.clubId,
      },
      tee: {
        id: tee.id,
        name: tee.name,
        color: tee.color,
        distance: tee.distance,
        par: tee.par,
        frontPar: tee.frontPar,
        backPar: tee.backPar,
        slopeMen: tee.slopeMen,
        slopeFrontMen: tee.slopeFrontMen,
        slopeBackMen: tee.slopeBackMen,
        slopeWomen: tee.slopeWomen,
        slopeFrontWomen: tee.slopeFrontWomen,
        slopeBackWomen: tee.slopeBackWomen,
        ratingMen: tee.ratingMen,
        ratingFrontMen: tee.ratingFrontMen,
        ratingBackMen: tee.ratingBackMen,
        ratingWomen: tee.ratingWomen,
        ratingFrontWomen: tee.ratingFrontWomen,
        ratingBackWomen: tee.ratingBackWomen,
        holes: copyJsonArray(tee.holes),
        holesWomen: copyJsonArray(tee.holesWomen),
      },
    };
  }),
});

export const getEventRouteSegments = (event: EventRouteSource): EventRouteSegmentSource[] => {
  if (isSnapshot(event.routeSnapshot)) {
    return [...event.routeSnapshot.segments].sort(
      (left, right) => Number(left.position ?? 0) - Number(right.position ?? 0),
    );
  }
  if (Array.isArray(event.routeSegments) && event.routeSegments.length > 0) {
    return [...event.routeSegments].sort(
      (left, right) => Number(left.position ?? 0) - Number(right.position ?? 0),
    );
  }
  return [{
    courseId: event.courseId,
    teeId: event.teeId,
    position: 0,
    course: event.course,
    tee: event.tee,
  }];
};

const requireSegment = (segment: EventRouteSegmentSource, position: number) => {
  if (!segment.course || !segment.tee) {
    throw new Error(`Event route segment ${position + 1} is missing course or tee data.`);
  }
  return { course: segment.course, tee: segment.tee };
};

export const selectEventRouteHoles = (event: EventRouteSource, rawGender: unknown) => {
  const gender = normalizeGender(rawGender);
  const holesPlayed = Number(event.holes);
  const segments = getEventRouteSegments(event);
  if (segments.length === 1) {
    const { course, tee } = requireSegment(segments[0], 0);
    return selectRoundHoles(tee, course.numHoles, holesPlayed, event.startSide, gender);
  }
  if (segments.length !== 2 || holesPlayed !== 18) {
    throw new Error('An event route must contain one nine or two nines.');
  }

  const holes = segments.flatMap((segment, segmentIndex) => {
    const { course, tee } = requireSegment(segment, segmentIndex);
    if (Number(course.numHoles) > 9) {
      throw new Error('Combined event routes can only use independently playable 9-hole courses.');
    }
    return selectRoundHoles(tee, 9, 9, 'front', gender).holes.map((hole) => ({
      ...hole,
      num: segmentIndex * 9 + hole.num,
      hcp: hole.hcp * 2 - (segmentIndex === 0 ? 1 : 0),
    }));
  });
  return {
    holes,
    holesPlayed: 18 as const,
    side: 'front' as const,
    isNineHoleCourse: false,
    isRepeatedNine: false,
  };
};

export const modelEventTeeForRound = (
  event: EventRouteSource,
  rawGender: unknown,
): RoundTee => {
  const gender: Gender = normalizeGender(rawGender);
  const holesPlayed = Number(event.holes);
  const segments = getEventRouteSegments(event);

  if (segments.length === 1) {
    const { course, tee } = requireSegment(segments[0], 0);
    return modelTeeForRound(tee, holesPlayed, event.startSide, {
      courseHoles: course.numHoles,
      gender,
    });
  }

  if (segments.length !== 2 || holesPlayed !== 18) {
    throw new Error('An event route must contain one nine or two nines.');
  }

  const modeledNines = segments.map((segment, index) => {
    const { course, tee } = requireSegment(segment, index);
    if (Number(course.numHoles) > 9) {
      throw new Error('Combined event routes can only use independently playable 9-hole courses.');
    }
    return modelTeeForRound(tee, 9, 'front', { courseHoles: 9, gender });
  });

  const holes = selectEventRouteHoles(event, gender).holes;
  const repeatedNine =
    Number(segments[0].courseId ?? segments[0].course?.id) ===
      Number(segments[1].courseId ?? segments[1].course?.id) &&
    Number(segments[0].teeId ?? segments[0].tee?.id) ===
      Number(segments[1].teeId ?? segments[1].tee?.id);

  return {
    slope: Math.round((modeledNines[0].slope + modeledNines[1].slope) / 2),
    rating: Number((modeledNines[0].rating + modeledNines[1].rating).toFixed(1)),
    par: modeledNines[0].par + modeledNines[1].par,
    holes,
    holesPlayed: 18,
    gender,
    side: 'front',
    isNineHoleCourse: false,
    isRepeatedNine: repeatedNine,
  };
};

export const getEventRouteLabel = (event: EventRouteSource) =>
  getEventRouteSegments(event)
    .map((segment) => String(segment.course?.name || '').trim())
    .filter(Boolean)
    .join(' → ');
