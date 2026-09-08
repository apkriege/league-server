import type { CourseImportSearchResult } from './courseImport';

type ExistingCourse = {
  name: string;
  location: string | null;
  club: { location: string | null };
};

const normalizeName = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(the|golf|course|club|country)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeCity = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cityFromLocation = (location: string | null) => {
  const parts = String(location || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts.at(-2) || '' : parts[0] || '';
};

export const excludeExistingCourses = (
  results: CourseImportSearchResult[],
  existingCourses: ExistingCourse[],
) => {
  const existingKeys = new Set<string>();
  existingCourses.forEach((course) => {
    const name = normalizeName(course.name);
    const cities = [course.location, course.club.location]
      .map(cityFromLocation)
      .map(normalizeCity)
      .filter(Boolean);
    cities.forEach((city) => existingKeys.add(`${name}\u0000${city}`));
  });

  return results.filter((result) => {
    const key = `${normalizeName(result.courseName)}\u0000${normalizeCity(result.city)}`;
    return !existingKeys.has(key);
  });
};
