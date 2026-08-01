import { describe, expect, it } from 'vitest';
import {
  dateOnlyInTimeZone,
  isValidTimeZone,
  localDateKey,
  localEventTimeToUtc,
  localTimeKey,
} from '../utils/time-zone';

describe('timezone utilities', () => {
  it('converts a course-local tee time to its UTC instant', () => {
    const startsAt = localEventTimeToUtc('2026-08-01', '09:00', 'America/Detroit');
    expect(startsAt.toISOString()).toBe('2026-08-01T13:00:00.000Z');
  });

  it('uses the correct daylight-saving offset for winter', () => {
    const startsAt = localEventTimeToUtc('2026-01-10', '09:00', 'America/Detroit');
    expect(startsAt.toISOString()).toBe('2026-01-10T14:00:00.000Z');
  });

  it('extracts the course-local date and time from a UTC instant', () => {
    const startsAt = '2026-08-01T13:00:00.000Z';
    expect(localDateKey(startsAt, 'America/Detroit')).toBe('2026-08-01');
    expect(localTimeKey(startsAt, 'America/Detroit')).toBe('09:00');
    expect(dateOnlyInTimeZone(startsAt, 'America/Detroit').toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });

  it('validates IANA timezone names', () => {
    expect(isValidTimeZone('America/Detroit')).toBe(true);
    expect(isValidTimeZone('EST')).toBe(false);
    expect(isValidTimeZone('Not/A_Timezone')).toBe(false);
  });
});
