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
  sharedTeamScorecard?: 'male' | 'female';
};

const defaultAllowance = (mode: ScoringMode) => {
  if (mode === 'four-ball-match') return 0.9;
  return 1;
};

const normalizeAllowance = (raw: unknown, mode: ScoringMode) => {
  if (raw == null) return defaultAllowance(mode);
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
    handicapAllowance: normalizeAllowance(source.handicapAllowance, mode),
  };
  if (mode === 'scramble' || mode === 'alternate-shot') {
    const scorecard = String(source.sharedTeamScorecard || 'male').toLowerCase();
    if (scorecard !== 'male' && scorecard !== 'female') {
      throw new Error('Shared team scorecard must be male or female.');
    }
    configuration.sharedTeamScorecard = scorecard;
  }

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
