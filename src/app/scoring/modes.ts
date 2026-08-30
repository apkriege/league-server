export type CompetitionModel = 'individual' | 'team';

export type ScoringMode =
  | 'stroke-play'
  | 'match-play'
  | 'stableford'
  | 'maximum-score'
  | 'best-ball'
  | 'four-ball-match'
  | 'scramble'
  | 'alternate-shot';

export type ScoringModeDefinition = {
  id: ScoringMode;
  label: string;
  competitionModels: readonly CompetitionModel[];
  scoreInput: 'player-scores' | 'shared-team-score';
  individualHandicapEligible: boolean;
};

export const SCORING_MODES: Record<ScoringMode, ScoringModeDefinition> = {
  'stroke-play': {
    id: 'stroke-play',
    label: 'Stroke Play',
    competitionModels: ['individual', 'team'],
    scoreInput: 'player-scores',
    individualHandicapEligible: true,
  },
  'match-play': {
    id: 'match-play',
    label: 'Match Play',
    competitionModels: ['individual', 'team'],
    scoreInput: 'player-scores',
    individualHandicapEligible: true,
  },
  stableford: {
    id: 'stableford',
    label: 'Stableford',
    competitionModels: ['individual', 'team'],
    scoreInput: 'player-scores',
    individualHandicapEligible: true,
  },
  'maximum-score': {
    id: 'maximum-score',
    label: 'Maximum Score',
    competitionModels: ['individual', 'team'],
    scoreInput: 'player-scores',
    individualHandicapEligible: true,
  },
  'best-ball': {
    id: 'best-ball',
    label: 'Best Ball',
    competitionModels: ['team'],
    scoreInput: 'player-scores',
    individualHandicapEligible: true,
  },
  'four-ball-match': {
    id: 'four-ball-match',
    label: 'Four-Ball Match Play',
    competitionModels: ['team'],
    scoreInput: 'player-scores',
    individualHandicapEligible: true,
  },
  scramble: {
    id: 'scramble',
    label: 'Scramble',
    competitionModels: ['team'],
    scoreInput: 'shared-team-score',
    individualHandicapEligible: false,
  },
  'alternate-shot': {
    id: 'alternate-shot',
    label: 'Alternate Shot',
    competitionModels: ['team'],
    scoreInput: 'shared-team-score',
    individualHandicapEligible: false,
  },
};

const aliases: Record<string, ScoringMode> = {
  stroke: 'stroke-play',
  'stroke play': 'stroke-play',
  medal: 'stroke-play',
  match: 'match-play',
  'match play': 'match-play',
  stableford: 'stableford',
  'modified stableford': 'stableford',
  'maximum score': 'maximum-score',
  max: 'maximum-score',
  'best ball': 'best-ball',
  betterball: 'best-ball',
  'better ball': 'best-ball',
  'four ball': 'best-ball',
  'four-ball': 'best-ball',
  'four ball match': 'four-ball-match',
  'four-ball match play': 'four-ball-match',
  scramble: 'scramble',
  foursomes: 'alternate-shot',
  'alternate shot': 'alternate-shot',
};

export const getScoringMode = (raw: unknown): ScoringModeDefinition => {
  const normalized = String(raw || '').trim().toLowerCase();
  const id = (aliases[normalized] || normalized) as ScoringMode;
  const definition = SCORING_MODES[id];
  if (!definition) throw new Error(`Unsupported scoring mode: ${String(raw || '')}`);
  return definition;
};

export const getScoringFamily = (mode: ScoringMode): 'stroke' | 'match' =>
  mode === 'match-play' || mode === 'four-ball-match' ? 'match' : 'stroke';

export const getScoringFamilyForMode = (mode: unknown): 'stroke' | 'match' =>
  getScoringFamily(getScoringMode(mode).id);

export const validateScoringMode = (rawMode: unknown, competitionModel: CompetitionModel) => {
  const definition = getScoringMode(rawMode);
  if (!definition.competitionModels.includes(competitionModel)) {
    throw new Error(`${definition.label} is not available for ${competitionModel} competition.`);
  }
  return definition;
};
