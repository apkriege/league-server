const OPEN_GOLF_API_BASE_URL = 'https://api.opengolfapi.org';
const REQUEST_TIMEOUT_MS = 10000;

type ExternalSearchCourse = {
  id?: string;
  name?: string | null;
  course_name?: string | null;
  city?: string | null;
  state?: string | null;
  type?: string | null;
  par?: number | null;
  phone?: string | null;
  website?: string | null;
};

type ExternalTee = {
  tee_key?: string | null;
  tee_name?: string | null;
  tee_color?: string | null;
  gender?: string | null;
  course_rating?: number | null;
  slope?: number | null;
  par?: number | null;
  yardage?: number | null;
};

type ExternalHole = {
  number?: number | null;
  par?: number | null;
  handicap_index?: number | null;
  yardages?: Record<string, number | null> | null;
};

type ExternalCourseDetail = {
  id?: string;
  course_name?: string | null;
  club_name?: string | null;
  city?: string | null;
  state?: string | null;
  type?: string | null;
  par?: number | null;
  holes?: number | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  postal_code?: string | null;
  architect?: string | null;
  year_built?: number | null;
  description?: string | null;
  tees?: ExternalTee[] | null;
  holes_data?: ExternalHole[] | null;
};

export type CourseImportSearchResult = {
  externalId: string;
  clubName: string;
  courseName: string;
  city: string;
  state: string;
  location: string;
  accessType: 'public' | 'private';
  par: number | null;
  phone: string;
  website: string;
};

export type ImportedCourse = {
  provider: 'OpenGolfAPI';
  attribution: string;
  warnings: string[];
  club: {
    name: string;
    description: string;
    location: string;
    phone: string;
    link: string;
    accessType: 'public' | 'private';
  };
  course: {
    name: string;
    description: string;
    location: string;
    phone: string;
    accessType: 'public' | 'private';
    numHoles: number;
    par: number;
    tees: Array<{
      name: string;
      color: string;
      distance: number;
      par: number;
      frontPar: number;
      backPar: number;
      slopeMen: number;
      slopeFrontMen: number;
      slopeBackMen: number;
      slopeWomen: number | null;
      slopeFrontWomen: number | null;
      slopeBackWomen: number | null;
      ratingMen: number;
      ratingFrontMen: number;
      ratingBackMen: number;
      ratingWomen: number | null;
      ratingFrontWomen: number | null;
      ratingBackWomen: number | null;
      holes: Array<{ num: number; par: number; dis: number; hcp: number }>;
    }>;
  };
};

const normalizeText = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');

const asPositiveNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const accessTypeFrom = (value: unknown): 'public' | 'private' =>
  normalizeText(value).includes('private') ? 'private' : 'public';

const fetchJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${OPEN_GOLF_API_BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Course directory returned HTTP ${response.status}`);
  }

  return (await response.json()) as T;
};

const splitRating = (rating: number, frontPar: number, totalPar: number) =>
  Number(((rating * frontPar) / totalPar).toFixed(1));

const splitTeeValue = (
  value: number | null,
  holeCount: number,
  frontPar: number,
  totalPar: number,
) => {
  if (value === null) return { full: null, front: null, back: null };
  if (holeCount <= 9) return { full: value, front: value, back: 0 };

  const front = splitRating(value, frontPar, totalPar);
  return { full: value, front, back: Number((value - front).toFixed(1)) };
};

const teeLookupKeys = (tee: ExternalTee) =>
  [tee.tee_color, tee.tee_name, String(tee.tee_key || '').split('-')[0]]
    .map(normalizeText)
    .filter(Boolean);

const findHoleYardage = (hole: ExternalHole, tee: ExternalTee) => {
  const yardages = hole.yardages || {};
  const keys = teeLookupKeys(tee);
  const entry = Object.entries(yardages).find(([key]) => keys.includes(normalizeText(key)));
  return asPositiveNumber(entry?.[1], 0);
};

const teeGroupKey = (tee: ExternalTee) =>
  normalizeText(tee.tee_name || tee.tee_color || tee.tee_key || 'tee');

export const mapImportedCourse = (detail: ExternalCourseDetail): ImportedCourse => {
  const warnings: string[] = [];
  const reportedHoleCount = asPositiveNumber(detail.holes, 18);
  const holeCount = reportedHoleCount <= 9 ? 9 : 18;
  const externalHoles = Array.isArray(detail.holes_data) ? detail.holes_data : [];
  const missingHoleCount = Math.max(0, holeCount - externalHoles.length);
  const invalidHandicapCount = externalHoles.filter((hole) => {
    const handicap = asPositiveNumber(hole.handicap_index, 0);
    return handicap > holeCount;
  }).length;
  const holes = Array.from({ length: holeCount }, (_, index) => {
    const externalHole =
      externalHoles.find((hole) => Number(hole.number) === index + 1) ?? externalHoles[index];
    const handicap = asPositiveNumber(externalHole?.handicap_index, index + 1);
    return {
      number: index + 1,
      par: asPositiveNumber(externalHole?.par, 4),
      handicap: handicap <= holeCount ? handicap : index + 1,
      external: externalHole,
    };
  });
  const reportedPar = asPositiveNumber(detail.par, sum(holes.map((hole) => hole.par)));
  const scorecardPar = sum(holes.map((hole) => hole.par));
  const frontPar = sum(holes.slice(0, 9).map((hole) => hole.par));
  const backPar = holeCount <= 9 ? 0 : sum(holes.slice(9).map((hole) => hole.par));

  if (scorecardPar !== reportedPar) {
    warnings.push(
      `The provider reports par ${reportedPar}, but its hole data totals ${scorecardPar}. Review the hole pars before saving.`,
    );
  }
  if (missingHoleCount > 0) {
    warnings.push(`The provider is missing data for ${missingHoleCount} hole(s).`);
  }
  if (invalidHandicapCount > 0) {
    warnings.push(
      `${invalidHandicapCount} handicap rank(s) were outside the ${holeCount}-hole range and were reset for review.`,
    );
  }

  const groupedTees = new Map<string, ExternalTee[]>();
  for (const tee of Array.isArray(detail.tees) ? detail.tees : []) {
    const key = teeGroupKey(tee);
    groupedTees.set(key, [...(groupedTees.get(key) || []), tee]);
  }

  const tees = [...groupedTees.values()].map((teeEntries) => {
    const male =
      teeEntries.find((tee) => normalizeText(tee.gender).startsWith('male')) ?? teeEntries[0];
    const female =
      teeEntries.find((tee) => normalizeText(tee.gender).startsWith('female')) ?? null;
    const representative = male ?? female ?? teeEntries[0];
    const name = String(representative?.tee_name || representative?.tee_color || 'Tee').trim();
    const color = String(representative?.tee_color || name).trim().toLowerCase();
    const menRating = asPositiveNumber(male?.course_rating, 0);
    const menSlope = asPositiveNumber(male?.slope, 0);
    const womenRating = female ? asPositiveNumber(female.course_rating, 0) || null : null;
    const womenSlope = female ? asPositiveNumber(female.slope, 0) || null : null;
    const menRatings = splitTeeValue(menRating || null, holeCount, frontPar, reportedPar);
    const womenRatings = splitTeeValue(womenRating, holeCount, frontPar, reportedPar);
    const teeHoles = holes.map((hole) => ({
      num: hole.number,
      par: hole.par,
      dis: hole.external && representative ? findHoleYardage(hole.external, representative) : 0,
      hcp: hole.handicap,
    }));
    const missingYardages = teeHoles.filter((hole) => hole.dis === 0).length;

    if (missingYardages > 0) {
      warnings.push(`${name} tee is missing yardage for ${missingYardages} hole(s).`);
    }
    if (!menRating || !menSlope) {
      warnings.push(`${name} tee is missing a complete rating or slope.`);
    }

    return {
      name,
      color,
      distance: asPositiveNumber(representative?.yardage, sum(teeHoles.map((hole) => hole.dis))),
      par: asPositiveNumber(representative?.par, reportedPar),
      frontPar,
      backPar,
      slopeMen: menSlope,
      slopeFrontMen: menSlope,
      slopeBackMen: holeCount <= 9 ? 0 : menSlope,
      slopeWomen: womenSlope,
      slopeFrontWomen: womenSlope,
      slopeBackWomen: holeCount <= 9 ? 0 : womenSlope,
      ratingMen: menRatings.full ?? 0,
      ratingFrontMen: menRatings.front ?? 0,
      ratingBackMen: menRatings.back ?? 0,
      ratingWomen: womenRatings.full,
      ratingFrontWomen: womenRatings.front,
      ratingBackWomen: womenRatings.back,
      holes: teeHoles,
    };
  });

  if (tees.length === 0) {
    warnings.push('The provider did not return tee data for this course.');
  } else if (holeCount > 9) {
    warnings.push(
      'Front/back ratings and slopes were derived from full-course values. Verify them against the scorecard before saving.',
    );
  }

  const city = String(detail.city || '').trim();
  const state = String(detail.state || '').trim();
  const postalCode = String(detail.postal_code || '').trim();
  const streetAddress = String(detail.address || '').trim();
  const shortLocation = [city, state].filter(Boolean).join(', ');
  const fullLocation = [streetAddress, shortLocation, postalCode].filter(Boolean).join(', ');
  const accessType = accessTypeFrom(detail.type);
  const courseName = String(detail.course_name || 'Imported Course').trim();
  const clubName = String(detail.club_name || detail.course_name || 'Imported Club').trim();
  const description =
    String(detail.description || '').trim() ||
    [
      detail.architect ? `Designed by ${String(detail.architect).trim()}.` : '',
      detail.year_built ? `Opened in ${detail.year_built}.` : '',
    ]
      .filter(Boolean)
      .join(' ');

  return {
    provider: 'OpenGolfAPI',
    attribution: 'Course data provided by OpenGolfAPI (ODbL 1.0).',
    warnings: [...new Set(warnings)],
    club: {
      name: clubName,
      description,
      location: fullLocation || shortLocation,
      phone: String(detail.phone || '').trim(),
      link: String(detail.website || '').trim(),
      accessType,
    },
    course: {
      name: courseName,
      description,
      location: shortLocation,
      phone: String(detail.phone || '').trim(),
      accessType,
      numHoles: holeCount,
      par: reportedPar,
      tees,
    },
  };
};

export const searchCourseDirectory = async (name: string) => {
  const query = new URLSearchParams({ q: name });
  const response = await fetchJson<{ courses?: ExternalSearchCourse[] }>(
    `/v1/courses/search?${query.toString()}`,
  );

  return (Array.isArray(response.courses) ? response.courses : [])
    .filter((course): course is ExternalSearchCourse & { id: string } => Boolean(course.id))
    .map(
      (course): CourseImportSearchResult => ({
        externalId: course.id,
        clubName: String(course.name || course.course_name || '').trim(),
        courseName: String(course.course_name || course.name || '').trim(),
        city: String(course.city || '').trim(),
        state: String(course.state || '').trim(),
        location: [course.city, course.state].filter(Boolean).join(', '),
        accessType: accessTypeFrom(course.type),
        par: course.par == null ? null : Number(course.par),
        phone: String(course.phone || '').trim(),
        website: String(course.website || '').trim(),
      }),
    );
};

export const loadCourseFromDirectory = async (externalId: string) => {
  const detail = await fetchJson<ExternalCourseDetail>(
    `/api/v1/courses/${encodeURIComponent(externalId)}`,
  );
  return mapImportedCourse(detail);
};
