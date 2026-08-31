const GOLF_COURSE_API_BASE_URL = 'https://api.golfcourseapi.com';
const OPEN_GOLF_API_BASE_URL = 'https://api.opengolfapi.org';
const REQUEST_TIMEOUT_MS = 15000;
const STATE_BATCH_SIZE = 50;
const STATE_DIRECTORY_PAGE_SIZE = 500;
const STATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const stateDiscoveryCache = new Map<string, { expiresAt: number; courses: DiscoveryCourse[] }>();

type ApiLocation = { address?: string | null; city?: string | null; state?: string | null; country?: string | null };
type ApiHole = { par?: number | null; yardage?: number | null; handicap?: number | null };
type ApiTee = {
  tee_name?: string | null;
  course_rating?: number | null;
  slope_rating?: number | null;
  total_yards?: number | null;
  number_of_holes?: number | null;
  par_total?: number | null;
  holes?: ApiHole[] | null;
};
type ApiCourse = {
  id?: string;
  club_name?: string | null;
  course_name?: string | null;
  scorecard_url?: string | null;
  location?: ApiLocation | null;
  tees?: { male?: ApiTee[] | number | null; female?: ApiTee[] | number | null } | null;
};
type DiscoveryCourse = {
  name?: string | null;
  course_name?: string | null;
  city?: string | null;
  state?: string | null;
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
  maleTeeCount: number;
  femaleTeeCount: number;
  alreadyImported?: boolean;
  availabilityUnchecked?: boolean;
};

type ImportedTee = {
  name: string;
  color: string;
  distance: number;
  par: number;
  frontPar: number;
  backPar: number;
  slopeMen: number | null;
  slopeFrontMen: number | null;
  slopeBackMen: number | null;
  slopeWomen: number | null;
  slopeFrontWomen: number | null;
  slopeBackWomen: number | null;
  ratingMen: number | null;
  ratingFrontMen: number | null;
  ratingBackMen: number | null;
  ratingWomen: number | null;
  ratingFrontWomen: number | null;
  ratingBackWomen: number | null;
  holes: Array<{ num: number; par: number; dis: number; hcp: number }>;
  holesWomen: Array<{ num: number; par: number; dis: number; hcp: number }>;
};

export type ImportedCourse = {
  provider: 'GolfCourseAPI';
  externalId: string;
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
    externalProvider: 'GolfCourseAPI';
    externalId: string;
    scorecardUrl: string;
    tees: ImportedTee[];
  };
};

const normalizeText = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b(golf|course|club|country|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeState = (value: unknown) => String(value || '').trim().toUpperCase();
const positiveNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const apiKey = () => {
  const key = process.env.GOLF_API_KEY?.trim();
  if (!key) throw new Error('Missing GOLF_API_KEY');
  return key;
};

const fetchJson = async <T>(baseUrl: string, path: string, authenticated = false): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(authenticated ? { Authorization: `Bearer ${apiKey()}` } : {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error('Course provider rate limit reached');
    throw new Error(`Course provider returned HTTP ${response.status}`);
  }
  return (await response.json()) as T;
};

const teeCount = (value: ApiTee[] | number | null | undefined) =>
  Array.isArray(value) ? value.length : Math.max(0, Number(value) || 0);

const toSearchResult = (course: ApiCourse): CourseImportSearchResult => {
  const location = course.location || {};
  const city = String(location.city || '').trim();
  const state = normalizeState(location.state);
  return {
    externalId: String(course.id || '').trim(),
    clubName: String(course.club_name || course.course_name || '').trim(),
    courseName: String(course.course_name || course.club_name || '').trim(),
    city,
    state,
    location: [city, state].filter(Boolean).join(', '),
    accessType: 'public',
    par: null,
    phone: '',
    website: '',
    maleTeeCount: teeCount(course.tees?.male),
    femaleTeeCount: teeCount(course.tees?.female),
  };
};

const searchProvider = async (name: string) => {
  const query = new URLSearchParams({ search_query: name, fuzzy_match: 'true' });
  const response = await fetchJson<{ courses?: ApiCourse[] }>(
    GOLF_COURSE_API_BASE_URL,
    `/v1/search?${query.toString()}`,
    true,
  );
  return (Array.isArray(response.courses) ? response.courses : []).filter(
    (course): course is ApiCourse & { id: string } => Boolean(course.id),
  );
};

export const searchCourseDirectory = async (name: string, state?: string) => {
  const requestedState = normalizeState(state);
  return (await searchProvider(name))
    .filter((course) => !requestedState || normalizeState(course.location?.state) === requestedState)
    .map(toSearchResult);
};

const matchDiscovery = async (discovery: DiscoveryCourse) => {
  const name = String(discovery.course_name || discovery.name || '').trim();
  if (!name) return [];
  const targetName = normalizeText(name);
  const targetCity = normalizeText(discovery.city);
  const targetState = normalizeState(discovery.state);
  const scored = (await searchProvider(name))
    .filter((candidate) => normalizeState(candidate.location?.state) === targetState)
    .map((candidate) => {
      const courseName = normalizeText(candidate.course_name);
      const clubName = normalizeText(candidate.club_name);
      const exact = courseName === targetName || clubName === targetName;
      const related =
        courseName.includes(targetName) || targetName.includes(courseName) ||
        clubName.includes(targetName) || targetName.includes(clubName);
      const cityMatch = targetCity && targetCity === normalizeText(candidate.location?.city);
      return { candidate, score: (exact ? 100 : related ? 70 : 0) + (cityMatch ? 20 : 0) };
    })
    .filter(({ score }) => score >= 90)
    .sort((left, right) => right.score - left.score);
  return scored.length === 1 || scored[0]?.score > scored[1]?.score
    ? [toSearchResult(scored[0].candidate)]
    : [];
};

const encodeDiscoveryId = (course: DiscoveryCourse) =>
  `lookup-${Buffer.from(JSON.stringify({
    name: String(course.course_name || course.name || '').trim(),
    city: String(course.city || '').trim(),
    state: normalizeState(course.state),
  })).toString('base64url')}`;

const decodeDiscoveryId = (externalId: string): DiscoveryCourse | null => {
  if (!externalId.startsWith('lookup-')) return null;
  try {
    const parsed = JSON.parse(Buffer.from(externalId.slice(7), 'base64url').toString('utf8')) as {
      name?: unknown;
      city?: unknown;
      state?: unknown;
    };
    return {
      course_name: String(parsed.name || '').trim(),
      city: String(parsed.city || '').trim(),
      state: normalizeState(parsed.state),
    };
  } catch {
    throw new Error('Invalid state course selection');
  }
};

export const searchStateCourseDirectory = async (state: string, offset = 0) => {
  const stateCode = normalizeState(state);
  const cached = stateDiscoveryCache.get(stateCode);
  let discoveries = cached?.expiresAt && cached.expiresAt > Date.now() ? cached.courses : null;
  if (!discoveries) {
    discoveries = [];
    let providerOffset = 0;
    while (true) {
      const query = new URLSearchParams({
        limit: String(STATE_DIRECTORY_PAGE_SIZE),
        offset: String(providerOffset),
      });
      const response = await fetchJson<{ courses?: DiscoveryCourse[]; total?: number }>(
        OPEN_GOLF_API_BASE_URL,
        `/v1/courses/state/${encodeURIComponent(stateCode)}?${query.toString()}`,
      );
      const providerPage = Array.isArray(response.courses) ? response.courses : [];
      discoveries.push(...providerPage);
      const total = Number(response.total);
      if (
        providerPage.length === 0 ||
        providerPage.length < STATE_DIRECTORY_PAGE_SIZE ||
        (Number.isFinite(total) && discoveries.length >= total)
      ) {
        break;
      }
      providerOffset += providerPage.length;
    }
    stateDiscoveryCache.set(stateCode, {
      expiresAt: Date.now() + STATE_CACHE_TTL_MS,
      courses: discoveries,
    });
  }
  const page = discoveries.slice(offset, offset + STATE_BATCH_SIZE);
  const results = page.map((course): CourseImportSearchResult => {
    const city = String(course.city || '').trim();
    const courseState = normalizeState(course.state) || stateCode;
    const name = String(course.course_name || course.name || '').trim();
    return {
      externalId: encodeDiscoveryId(course),
      clubName: name,
      courseName: name,
      city,
      state: courseState,
      location: [city, courseState].filter(Boolean).join(', '),
      accessType: 'public',
      par: null,
      phone: '',
      website: '',
      maleTeeCount: 0,
      femaleTeeCount: 0,
      availabilityUnchecked: true,
    };
  });
  return {
    results,
    offset,
    checked: page.length,
    unavailable: 0,
    total: discoveries.length,
    hasMore: offset + page.length < discoveries.length,
    nextOffset: offset + page.length,
  };
};

const teeKey = (tee: ApiTee) => normalizeText(tee.tee_name || 'tee');
const buildHoles = (tee: ApiTee, holeCount: number) =>
  Array.from({ length: holeCount }, (_, index) => {
    const hole = Array.isArray(tee.holes) ? tee.holes[index] : undefined;
    return {
      num: index + 1,
      par: positiveNumber(hole?.par) ?? 4,
      dis: positiveNumber(hole?.yardage) ?? 0,
      hcp: positiveNumber(hole?.handicap) ?? index + 1,
    };
  });

export const mapImportedCourse = (detail: ApiCourse): ImportedCourse => {
  const warnings: string[] = [
    'GolfCourseAPI does not provide public/private access; confirm the access type before saving.',
  ];
  const maleTees = Array.isArray(detail.tees?.male) ? detail.tees.male : [];
  const femaleTees = Array.isArray(detail.tees?.female) ? detail.tees.female : [];
  const keys = [...new Set([...maleTees.map(teeKey), ...femaleTees.map(teeKey)])];
  const tees = keys.map((key): ImportedTee => {
    const male = maleTees.find((tee) => teeKey(tee) === key) ?? null;
    const female = femaleTees.find((tee) => teeKey(tee) === key) ?? null;
    const representative = male ?? female;
    if (!representative) throw new Error('Invalid provider tee data');
    const holeCount = positiveNumber(representative.number_of_holes) ??
      Math.max(male?.holes?.length || 0, female?.holes?.length || 0, 18);
    const holes = buildHoles(representative, holeCount);
    const holesWomen = female ? buildHoles(female, holeCount) : holes;
    const frontPar = sum(holes.slice(0, 9).map((hole) => hole.par));
    const backPar = holeCount <= 9 ? 0 : sum(holes.slice(9).map((hole) => hole.par));
    const name = String(representative.tee_name || 'Tee').trim();
    if (!male) warnings.push(`${name} tee has no men's rating data.`);
    if (!female) warnings.push(`${name} tee has no women's rating data.`);
    if (holes.some((hole) => hole.dis === 0)) warnings.push(`${name} tee has missing yardages.`);
    if (holeCount > 9) warnings.push(`${name} tee needs official front/back ratings before use in 9-hole events.`);
    if (male && female && JSON.stringify(male.holes) !== JSON.stringify(female.holes)) {
      warnings.push(`${name} tee has different men's and women's hole data; review the scorecard.`);
    }
    return {
      name,
      color: name.toLowerCase(),
      distance: positiveNumber(representative.total_yards) ?? sum(holes.map((hole) => hole.dis)),
      par: positiveNumber(representative.par_total) ?? sum(holes.map((hole) => hole.par)),
      frontPar,
      backPar,
      slopeMen: positiveNumber(male?.slope_rating),
      slopeFrontMen: holeCount <= 9 ? positiveNumber(male?.slope_rating) : null,
      slopeBackMen: null,
      slopeWomen: positiveNumber(female?.slope_rating),
      slopeFrontWomen: holeCount <= 9 ? positiveNumber(female?.slope_rating) : null,
      slopeBackWomen: null,
      ratingMen: positiveNumber(male?.course_rating),
      ratingFrontMen: holeCount <= 9 ? positiveNumber(male?.course_rating) : null,
      ratingBackMen: null,
      ratingWomen: positiveNumber(female?.course_rating),
      ratingFrontWomen: holeCount <= 9 ? positiveNumber(female?.course_rating) : null,
      ratingBackWomen: null,
      holes,
      holesWomen,
    };
  });
  if (tees.length === 0) warnings.push('GolfCourseAPI did not return any tee scorecards.');
  const location = detail.location || {};
  const city = String(location.city || '').trim();
  const state = normalizeState(location.state);
  const shortLocation = [city, state].filter(Boolean).join(', ');
  const fullLocation = String(location.address || shortLocation).trim();
  const externalId = String(detail.id || '').trim();
  const numHoles = tees.length > 0 ? Math.max(...tees.map((tee) => tee.holes.length)) : 18;
  return {
    provider: 'GolfCourseAPI',
    externalId,
    attribution: 'Course and scorecard data provided by GolfCourseAPI.',
    warnings: [...new Set(warnings)],
    club: {
      name: String(detail.club_name || detail.course_name || 'Imported Club').trim(),
      description: '',
      location: fullLocation,
      phone: '',
      link: '',
      accessType: 'public',
    },
    course: {
      name: String(detail.course_name || detail.club_name || 'Imported Course').trim(),
      description: '',
      location: shortLocation,
      phone: '',
      accessType: 'public',
      numHoles,
      par: tees[0]?.par ?? (numHoles <= 9 ? 36 : 72),
      externalProvider: 'GolfCourseAPI',
      externalId,
      scorecardUrl: String(detail.scorecard_url || '').trim(),
      tees,
    },
  };
};

export const loadCourseFromDirectory = async (externalId: string) => {
  const discovery = decodeDiscoveryId(externalId);
  let providerId = externalId;
  if (discovery) {
    const matches = await matchDiscovery(discovery);
    if (matches.length === 0) {
      throw new Error('GolfCourseAPI has no confident match for that course');
    }
    providerId = matches[0].externalId;
  }
  const response = await fetchJson<ApiCourse | { course?: ApiCourse }>(
    GOLF_COURSE_API_BASE_URL,
    `/v1/courses/${encodeURIComponent(providerId)}`,
    true,
  );
  const detail = (response as { course?: ApiCourse }).course ?? (response as ApiCourse);
  return mapImportedCourse(detail);
};
