export type EventFormat = 'individual' | 'team';
export type EventScoringFormat = 'stroke' | 'match';

const formatAliases: Array<{ keys: string[]; value: EventFormat }> = [
  { keys: ['single', 'individual', 'solo'], value: 'individual' },
  { keys: ['team', 'best ball', 'best-ball', 'bestball'], value: 'team' },
];

const scoringAliases: Array<{ keys: string[]; value: EventScoringFormat }> = [
  { keys: ['stroke', 'medal', 'best ball', 'best-ball', 'bestball'], value: 'stroke' },
  { keys: ['match', 'matchplay', 'match play'], value: 'match' },
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

export const normalizeScoringFormat = (raw: unknown, fallback: EventScoringFormat = 'stroke') => {
  return resolveAlias(raw, scoringAliases) || fallback;
};

export const validateEventMode = (format: EventFormat, scoringFormat: EventScoringFormat) => {
  const supported =
    (format === 'individual' && scoringFormat === 'stroke') ||
    (format === 'individual' && scoringFormat === 'match') ||
    (format === 'team' && scoringFormat === 'stroke') ||
    (format === 'team' && scoringFormat === 'match');

  if (!supported) {
    throw new Error(`Unsupported event mode: ${format} ${scoringFormat}`);
  }
};
