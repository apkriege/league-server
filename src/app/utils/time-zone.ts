import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

export const DEFAULT_TIME_ZONE = 'America/Detroit';

export const isValidTimeZone = (value: unknown): value is string => {
  const timeZone = String(value ?? '').trim();
  if (!timeZone || (timeZone !== 'UTC' && !timeZone.includes('/'))) return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
};

export const normalizeTimeZone = (
  value: unknown,
  fallback = DEFAULT_TIME_ZONE,
): string => {
  const timeZone = String(value ?? '').trim() || fallback;
  if (!isValidTimeZone(timeZone)) {
    throw new Error(`Invalid IANA timezone: ${timeZone}.`);
  }
  return timeZone;
};

const dateOnlyKey = (value: unknown): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const match = String(value ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) throw new Error('Invalid date. Expected YYYY-MM-DD.');
  return match[1];
};

const normalizeLocalTime = (value: unknown): string => {
  const input = String(value ?? '').trim();
  const parsed = dayjs(input, ['H:mm', 'HH:mm', 'H:mm:ss', 'HH:mm:ss', 'h:mm A'], true);
  if (!parsed.isValid()) throw new Error('Invalid time. Expected HH:mm.');
  return parsed.format('HH:mm');
};

export const localEventTimeToUtc = (
  date: unknown,
  time: unknown,
  rawTimeZone: unknown,
): Date => {
  const dateKey = dateOnlyKey(date);
  const timeKey = normalizeLocalTime(time);
  const timeZone = normalizeTimeZone(rawTimeZone);
  const localDateTime = `${dateKey} ${timeKey}`;
  const parsed = dayjs.tz(localDateTime, 'YYYY-MM-DD HH:mm', timeZone);

  if (!parsed.isValid() || parsed.format('YYYY-MM-DD HH:mm') !== localDateTime) {
    throw new Error(`The selected local time does not exist in ${timeZone}.`);
  }

  return parsed.toDate();
};

const zonedParts = (value: Date | string, timeZone: string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid timestamp.');

  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: normalizeTimeZone(timeZone),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
};

export const dateOnlyInTimeZone = (value: Date | string, timeZone: string): Date => {
  const parts = zonedParts(value, timeZone);
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
};

export const localDateKey = (value: Date | string, timeZone: string): string => {
  const parts = zonedParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const localTimeKey = (value: Date | string, timeZone: string): string => {
  const parts = zonedParts(value, timeZone);
  return `${parts.hour}:${parts.minute}`;
};
