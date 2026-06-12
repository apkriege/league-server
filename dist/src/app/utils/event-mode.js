"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEventMode = exports.normalizeScoringFormat = exports.normalizeEventFormat = void 0;
const formatAliases = [
    { keys: ['single', 'individual', 'solo'], value: 'individual' },
    { keys: ['team', 'best ball', 'best-ball', 'bestball'], value: 'team' },
];
const scoringAliases = [
    { keys: ['stroke', 'medal', 'best ball', 'best-ball', 'bestball'], value: 'stroke' },
    { keys: ['match', 'matchplay', 'match play'], value: 'match' },
];
const normalizeText = (value) => String(value || '')
    .trim()
    .toLowerCase();
const resolveAlias = (raw, aliases) => {
    const text = normalizeText(raw);
    if (!text)
        return null;
    for (const alias of aliases) {
        if (alias.keys.some((key) => text === key || text.includes(key))) {
            return alias.value;
        }
    }
    return null;
};
const normalizeEventFormat = (raw, fallback = 'individual') => {
    return resolveAlias(raw, formatAliases) || fallback;
};
exports.normalizeEventFormat = normalizeEventFormat;
const normalizeScoringFormat = (raw, fallback = 'stroke') => {
    return resolveAlias(raw, scoringAliases) || fallback;
};
exports.normalizeScoringFormat = normalizeScoringFormat;
const validateEventMode = (format, scoringFormat) => {
    const supported = (format === 'individual' && scoringFormat === 'stroke') ||
        (format === 'individual' && scoringFormat === 'match') ||
        (format === 'team' && scoringFormat === 'stroke') ||
        (format === 'team' && scoringFormat === 'match');
    if (!supported) {
        throw new Error(`Unsupported event mode: ${format} ${scoringFormat}`);
    }
};
exports.validateEventMode = validateEventMode;
