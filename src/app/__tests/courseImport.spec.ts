import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mapImportedCourse,
  loadCourseFromDirectory,
  searchCourseDirectory,
  searchStateCourseDirectory,
} from '../services/courseImport';

const originalKey = process.env.GOLF_API_KEY;

beforeEach(() => {
  process.env.GOLF_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.GOLF_API_KEY;
  else process.env.GOLF_API_KEY = originalKey;
});

describe('course import service', () => {
  it('searches GolfCourseAPI and can filter same-name courses by state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          courses: [
            {
              id: '7k2m9qb4',
              club_name: 'Apple Mountain Golf Course',
              course_name: 'Apple Mountain Golf Course',
              location: { city: 'Freeland', state: 'MI' },
              tees: { male: 4, female: 3 },
            },
            {
              id: '8k2m9qb4',
              club_name: 'Apple Mountain Resort',
              course_name: 'Apple Mountain Resort',
              location: { city: 'Clarkesville', state: 'GA' },
              tees: { male: 3, female: 2 },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchCourseDirectory('Apple Mountain', 'MI')).resolves.toEqual([
      expect.objectContaining({
        externalId: '7k2m9qb4',
        courseName: 'Apple Mountain Golf Course',
        location: 'Freeland, MI',
        maleTeeCount: 4,
        femaleTeeCount: 3,
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/search?'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
  });

  it('maps provider tees without inventing front/back ratings', () => {
    const holes = Array.from({ length: 18 }, (_, index) => ({
      par: index % 3 === 0 ? 5 : 4,
      yardage: 300 + index,
      handicap: index + 1,
    }));
    const imported = mapImportedCourse({
      id: '7k2m9qb4',
      club_name: 'Test Golf Club',
      course_name: 'Test Course',
      scorecard_url: 'https://example.com/scorecard',
      location: { address: '1 Golf Way', city: 'Saginaw', state: 'MI' },
      tees: {
        male: [{ tee_name: 'Blue', course_rating: 71.1, slope_rating: 125, total_yards: 6400, number_of_holes: 18, par_total: 75, holes }],
        female: [{ tee_name: 'Blue', course_rating: 76.2, slope_rating: 132, total_yards: 6400, number_of_holes: 18, par_total: 75, holes }],
      },
    });

    expect(imported.provider).toBe('GolfCourseAPI');
    expect(imported.course).toMatchObject({
      name: 'Test Course',
      externalId: '7k2m9qb4',
      scorecardUrl: 'https://example.com/scorecard',
      numHoles: 18,
    });
    expect(imported.course.tees[0]).toMatchObject({
      name: 'Blue',
      ratingMen: 71.1,
      slopeMen: 125,
      ratingWomen: 76.2,
      slopeWomen: 132,
      ratingFrontMen: null,
      slopeBackWomen: null,
    });
    expect(imported.course.tees[0].holes[0]).toEqual({ num: 1, par: 5, dis: 300, hcp: 1 });
    expect(imported.warnings).toContain(
      'Blue tee needs official front/back ratings before use in 9-hole events.',
    );
  });

  it('lists state discoveries without spending one provider request per course', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('opengolfapi.org')) {
        return new Response(
          JSON.stringify({
            courses: [
              { course_name: 'Apple Mountain Golf Course', city: 'Freeland', state: 'MI' },
              { course_name: 'Missing Course', city: 'Nowhere', state: 'MI' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ courses: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchStateCourseDirectory('MI')).resolves.toMatchObject({
      checked: 2,
      unavailable: 0,
      total: 2,
      hasMore: false,
      results: [
        expect.objectContaining({ courseName: 'Apple Mountain Golf Course', availabilityUnchecked: true }),
        expect.objectContaining({ courseName: 'Missing Course', availabilityUnchecked: true }),
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/courses/state/MI?limit=500&offset=0'),
      expect.any(Object),
    );
  });

  it('loads every provider page when a state has more than 500 courses', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      course_name: `Wisconsin Course ${index + 1}`,
      city: 'Test City',
      state: 'WI',
    }));
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const courses = url.includes('offset=500')
        ? [{ course_name: 'Wisconsin Course 501', city: 'Test City', state: 'WI' }]
        : firstPage;
      return new Response(JSON.stringify({ total: 501, courses }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const firstBatch = await searchStateCourseDirectory('WI');

    expect(firstBatch).toMatchObject({ total: 501, checked: 50, hasMore: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('limit=500&offset=500'),
      expect.any(Object),
    );
  });

  it('unwraps the real GolfCourseAPI course detail response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            course: {
              id: '7k2m9qb4',
              club_name: 'Test Club',
              course_name: 'Test Course',
              location: { city: 'Saginaw', state: 'MI' },
              tees: {
                male: [
                  {
                    tee_name: 'Blue',
                    course_rating: 71.2,
                    slope_rating: 128,
                    number_of_holes: 9,
                    par_total: 36,
                    holes: Array.from({ length: 9 }, (_, index) => ({
                      par: 4,
                      yardage: 300 + index,
                      handicap: index + 1,
                    })),
                  },
                ],
                female: [],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const imported = await loadCourseFromDirectory('7k2m9qb4');
    expect(imported.course.tees).toHaveLength(1);
    expect(imported.course.tees[0]).toMatchObject({ name: 'Blue', ratingMen: 71.2, slopeMen: 128 });
    expect(imported.course.tees[0].holes).toHaveLength(9);
  });
});
