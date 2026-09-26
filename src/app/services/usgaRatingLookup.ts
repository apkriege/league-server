import { load } from 'cheerio';

export class UsgaLookupError extends Error {}

export const usgaCourseUrl = (courseId: number) =>
  `https://ncrdb.usga.org/courseTeeInfo?CourseID=${courseId}`;

const cellText = (value: string) => value.replace(/\s+/g, ' ').trim();

export const extractUsgaRatingTable = (html: string) => {
  const $ = load(html);
  for (const table of $('table').toArray()) {
    const rows = $(table).find('tr').toArray().map((row) =>
      $(row).children('th, td').toArray().map((cell) => cellText($(cell).text())),
    );
    const headerIndex = rows.findIndex((row) =>
      row.some((cell) => cell.toLowerCase() === 'tee name') &&
      row.some((cell) => cell.toLowerCase() === 'gender'),
    );
    if (headerIndex < 0) continue;
    const header = rows[headerIndex];
    const teeNameIndex = header.findIndex((cell) => cell.toLowerCase() === 'tee name');
    const genderIndex = header.findIndex((cell) => cell.toLowerCase() === 'gender');
    const teeRows = rows.slice(headerIndex + 1).filter((row) =>
      Boolean(row[teeNameIndex]) && /^(m|f|male|female)$/i.test(row[genderIndex] || ''),
    );
    if (teeRows.length > 0) {
      return [header, ...teeRows].map((row) => row.join('\t')).join('\n');
    }
  }
  throw new UsgaLookupError('The USGA page did not contain a readable tee rating table.');
};

export const loadUsgaRatingTable = async (courseId: number) => {
  if (!Number.isSafeInteger(courseId) || courseId <= 0) {
    throw new UsgaLookupError('Enter a valid USGA Course ID.');
  }
  const sourceUrl = usgaCourseUrl(courseId);
  const response = await fetch(sourceUrl, {
    headers: { Accept: 'text/html' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new UsgaLookupError(
      response.status === 403
        ? 'USGA blocked the automatic lookup (HTTP 403). Open the USGA page and use manual paste.'
        : `USGA lookup failed (HTTP ${response.status}). Try again or use manual paste.`,
    );
  }
  const html = await response.text();
  if (html.length > 2_000_000) throw new UsgaLookupError('The USGA page was too large to read safely.');
  return { courseId, sourceUrl, tableText: extractUsgaRatingTable(html) };
};
