import {
  normalizeMaximumScoreRule,
  type MaximumScoreRule,
} from './maximum-score';
import {
  normalizeStablefordPointScale,
  type StablefordPointScale,
} from './stableford';
import type { ScoringMode } from './modes';

export type ScoringConfiguration = {
  stablefordPointScale?: StablefordPointScale;
  maximumScore?: MaximumScoreRule;
  handicapAllowance: number;
};

const normalizeAllowance = (raw: unknown) => {
  if (raw == null) return 1;
  const allowance = Number(raw);
  if (!Number.isFinite(allowance) || allowance < 0 || allowance > 1) {
    throw new Error('Handicap allowance must be between 0 and 1.');
  }
  return allowance;
};

export const normalizeScoringConfiguration = (
  raw: unknown,
  mode: ScoringMode,
): ScoringConfiguration => {
  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) {
    throw new Error('Scoring configuration must be an object.');
  }
  const source = (raw || {}) as Record<string, unknown>;
  const configuration: ScoringConfiguration = {
    handicapAllowance: normalizeAllowance(source.handicapAllowance),
  };

  if (source.stablefordPointScale !== undefined || mode === 'stableford') {
    configuration.stablefordPointScale = normalizeStablefordPointScale(
      source.stablefordPointScale,
    );
  }
  if (mode === 'maximum-score') {
    configuration.maximumScore = normalizeMaximumScoreRule(source.maximumScore);
  } else if (source.maximumScore !== undefined) {
    configuration.maximumScore = normalizeMaximumScoreRule(source.maximumScore);
  }

  return configuration;
};
