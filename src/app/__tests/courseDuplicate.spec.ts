import { describe, expect, it } from 'vitest';
import { excludeExistingCourses, markExistingCourses } from '../services/courseDuplicate';

const result = (courseName: string, city: string) => ({
  externalId: `${courseName}-${city}`,
  clubName: courseName,
  courseName,
  city,
  state: 'MI',
  location: `${city}, MI`,
  accessType: 'public' as const,
  par: null,
  phone: '',
  website: '',
  maleTeeCount: 0,
  femaleTeeCount: 0,
});

describe('course duplicate filtering', () => {
  it('flags matching results while keeping them in the response', () => {
    const results = [result('The Sawmill Golf Club', 'Saginaw'), result('The Sawmill', 'Lansing')];
    const existing = [
      {
        name: 'Sawmill',
        location: 'Saginaw, MI',
        club: { location: null },
      },
    ];

    expect(markExistingCourses(results, existing)).toEqual([
      { ...results[0], alreadyImported: true },
      { ...results[1], alreadyImported: false },
    ]);
  });

  it('removes matching course names and cities despite formatting differences', () => {
    const results = [result('The Fortress Golf Course', 'Frankenmuth'), result('Fortress', 'Detroit')];
    const existing = [
      {
        name: 'Fortress',
        location: 'Frankenmuth, MI',
        club: { location: null },
      },
    ];

    expect(excludeExistingCourses(results, existing)).toEqual([results[1]]);
  });

  it('uses the club city when the course has no location', () => {
    const results = [result('Pine View', 'Ann Arbor')];
    const existing = [
      {
        name: 'Pine View Golf Club',
        location: null,
        club: { location: '100 Main Street, Ann Arbor, MI' },
      },
    ];

    expect(excludeExistingCourses(results, existing)).toEqual([]);
  });

  it('keeps courses with the same name in a different city', () => {
    const results = [result('Lakeside Golf Course', 'Lansing')];
    const existing = [
      {
        name: 'Lakeside Golf Course',
        location: 'Grand Rapids, MI',
        club: { location: null },
      },
    ];

    expect(excludeExistingCourses(results, existing)).toEqual(results);
  });
});
