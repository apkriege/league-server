export type MaximumScoreRule =
  | { type: 'fixed'; strokes: number }
  | { type: 'relative-to-par'; strokesOverPar: number }
  | { type: 'net-double-bogey' };

const wholeNumber = (value: unknown, label: string, minimum: number) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be a whole number of at least ${minimum}.`);
  }
  return parsed;
};

export const normalizeMaximumScoreRule = (raw: unknown): MaximumScoreRule => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('A maximum-score rule is required.');
  }
  const source = raw as Record<string, unknown>;
  if (source.type === 'fixed') {
    return { type: 'fixed', strokes: wholeNumber(source.strokes, 'Maximum strokes', 1) };
  }
  if (source.type === 'relative-to-par') {
    return {
      type: 'relative-to-par',
      strokesOverPar: wholeNumber(source.strokesOverPar, 'Strokes over par', 0),
    };
  }
  if (source.type === 'net-double-bogey') return { type: 'net-double-bogey' };
  throw new Error('Unsupported maximum-score rule.');
};

export const getMaximumGrossScore = ({
  par,
  pops = 0,
  rule,
}: {
  par: number;
  pops?: number;
  rule: MaximumScoreRule;
}) => {
  if (rule.type === 'fixed') return rule.strokes;
  if (rule.type === 'relative-to-par') return par + rule.strokesOverPar;
  return par + 2 + Math.max(0, pops);
};

export const applyMaximumScore = ({
  gross,
  par,
  pops = 0,
  rule,
}: {
  gross: number;
  par: number;
  pops?: number;
  rule: MaximumScoreRule;
}) => {
  const maximumGross = getMaximumGrossScore({ par, pops, rule });
  const cappedGross = Math.min(gross, maximumGross);
  return {
    gross: cappedGross,
    net: Math.max(0, cappedGross - Math.max(0, pops)),
    maximumGross,
    wasCapped: cappedGross !== gross,
  };
};
