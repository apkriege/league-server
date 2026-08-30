export type EventFormat = 'individual' | 'team';
export type EventScoringFormat = 'stroke' | 'match';

const formatAliases: Array<{ keys: string[]; value: EventFormat }> = [
  { keys: ['single', 'individual', 'solo'], value: 'individual' },
  { keys: ['team', 'best ball', 'best-ball', 'bestball'], value: 'team' },
];

const normalizeText = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase();

const resolveAlias = <T extends string>(
  raw: unknown,
  aliases: Array<{ keys: string[]; value: T }>,
): T | null => {
  const text = normalizeText(raw);
  if (!text) return null;

  for (const alias of aliases) {
    if (alias.keys.some((key) => text === key || text.includes(key))) {
      return alias.value;
    }
  }

  return null;
};

export const normalizeEventFormat = (raw: unknown, fallback: EventFormat = 'individual') => {
  return resolveAlias(raw, formatAliases) || fallback;
};

export const validateEventMode = (format: EventFormat, scoringFamily: EventScoringFormat) => {
  const supported =
    (format === 'individual' && scoringFamily === 'stroke') ||
    (format === 'individual' && scoringFamily === 'match') ||
    (format === 'team' && scoringFamily === 'stroke') ||
    (format === 'team' && scoringFamily === 'match');

  if (!supported) {
    throw new Error(`Unsupported event mode: ${format} ${scoringFamily}`);
  }
};
