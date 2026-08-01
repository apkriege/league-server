import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapImportedCourse, searchCourseDirectory } from '../services/courseImport';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('course import service', () => {
  it('returns same-name courses in every location for selection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          courses: [
            {
              id: 'michigan-course',
              name: 'Apple Mountain Golf Course',
              course_name: 'Apple Mountain Golf Course',
              city: 'Freeland',
              state: 'MI',
              par: 72,
            },
            {
              id: 'georgia-course',
              name: 'Apple Mountain Resort',
              course_name: 'Apple Mountain Resort',
              city: 'Clarkesville',
              state: 'GA',
              par: 72,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchCourseDirectory('Apple Mountain')).resolves.toEqual([
      expect.objectContaining({
        externalId: 'michigan-course',
        clubName: 'Apple Mountain Golf Course',
        courseName: 'Apple Mountain Golf Course',
        location: 'Freeland, MI',
      }),
      expect.objectContaining({
        externalId: 'georgia-course',
        clubName: 'Apple Mountain Resort',
        courseName: 'Apple Mountain Resort',
        location: 'Clarkesville, GA',
      }),
    ]);
  });

  it('maps tee and hole data into the course form shape and reports provider inconsistencies', () => {
    const imported = mapImportedCourse({
      id: 'course-1',
      club_name: 'Test Golf Club',
      course_name: 'Test Course',
      city: 'Saginaw',
      state: 'MI',
      type: 'Public',
      par: 36,
      holes: 9,
      phone: '989-555-0100',
      website: 'https://example.com',
      tees: [
        {
          tee_key: 'blue-male',
          tee_name: 'Blue',
          tee_color: 'blue',
          gender: 'Male',
          course_rating: 35.1,
          slope: 121,
          par: 36,
          yardage: 3100,
        },
        {
          tee_key: 'blue-female',
          tee_name: 'Blue',
          tee_color: 'blue',
          gender: 'Female',
          course_rating: 38.2,
          slope: 128,
          par: 36,
          yardage: 3100,
        },
      ],
      holes_data: Array.from({ length: 9 }, (_, index) => ({
        number: index + 1,
        par: index === 8 ? 5 : 4,
        handicap_index: index + 1,
        yardages: { blue: 300 + index },
      })),
    });

    expect(imported.club).toMatchObject({
      name: 'Test Golf Club',
      location: 'Saginaw, MI',
    });
    expect(imported.course).toMatchObject({
      name: 'Test Course',
      numHoles: 9,
      par: 36,
    });
    expect(imported.course.tees).toHaveLength(1);
    expect(imported.course.tees[0]).toMatchObject({
      name: 'Blue',
      ratingMen: 35.1,
      ratingFrontMen: 35.1,
      ratingBackMen: 0,
      ratingWomen: 38.2,
      slopeWomen: 128,
    });
    expect(imported.course.tees[0].holes[0]).toEqual({
      num: 1,
      par: 4,
      dis: 300,
      hcp: 1,
    });
    expect(imported.warnings).toContain(
      'The provider reports par 36, but its hole data totals 37. Review the hole pars before saving.',
    );
  });
});
