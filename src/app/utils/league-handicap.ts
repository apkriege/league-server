import { roundHandicap } from './usga-handicap';
import { normalizeHandicapSettings, type HandicapSettings } from './handicap-settings';

export const LEAGUE_HANDICAP_POLICY = 'best-rounds-v2';
export type HandicapRound = { id: number; eventId: number; differential: number; holes: 9 | 18; playedAt: string };
export type HandicapAdjustment = { handicap: number; effectiveAt: string };
export type HandicapEntry = { roundIds: number[]; differential: number; playedAt: string };
export type HandicapCalculation = {
  policy: string;
  basis: 9 | 18;
  status: 'unknown' | 'provisional' | 'calculated' | 'manual';
  bestRounds: number;
  historyWindow: number;
  eligibleRounds: number;
  entries: HandicapEntry[];
  usedEntries: HandicapEntry[];
  average: number | null;
  maximumAdjustment: number;
  multiplier: number;
  index: number | null;
  overrides: number;
};

export function calculateLeagueHandicap(
  rounds: HandicapRound[],
  startingHandicap: number | null,
  basis: 9 | 18,
  adjustments: HandicapAdjustment[] = [],
  settings: Pick<HandicapSettings, 'handicapBestRounds' | 'handicapWindow'> & Partial<Pick<HandicapSettings, 'handicapMultiplier'>> = { handicapBestRounds: 6, handicapWindow: 8 },
): HandicapCalculation {
  if (startingHandicap !== null && !Number.isFinite(startingHandicap)) throw new Error('Invalid starting handicap.');
  const { handicapBestRounds: x, handicapWindow: y, handicapMultiplier: multiplier } = normalizeHandicapSettings({ ...settings, handicapHoleBasis: basis });
  const ordered = [...rounds].sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt) || a.eventId - b.eventId || a.id - b.id);
  const seen = new Set<number>();
  for (const round of ordered) {
    if (!Number.isInteger(round.id) || round.id <= 0 || !Number.isInteger(round.eventId) || round.eventId <= 0 ||
        (round.holes !== 9 && round.holes !== 18) || !Number.isFinite(round.differential) || !Number.isFinite(Date.parse(round.playedAt)) || seen.has(round.id)) {
      throw new Error('Invalid or duplicate handicap round.');
    }
    seen.add(round.id);
  }
  const entries = ordered.slice(-y).map((round) => ({ roundIds: [round.id], differential: round.differential, playedAt: round.playedAt }));
  const usedEntries = ordered.length <= x ? entries : [...entries].sort((a, b) => a.differential - b.differential).slice(0, x);
  const average = usedEntries.length ? usedEntries.reduce((sum, entry) => sum + entry.differential, 0) / usedEntries.length : null;
  const modifiedAverage = average == null ? null : average * multiplier;
  const maximum = 54 * basis / 18;
  let index = modifiedAverage == null ? startingHandicap : roundHandicap(Math.min(maximum, modifiedAverage));
  let status: HandicapCalculation['status'] = index == null ? 'unknown' : ordered.length < x ? 'provisional' : 'calculated';
  const orderedAdjustments = [...adjustments].sort((a, b) => Date.parse(a.effectiveAt) - Date.parse(b.effectiveAt));
  for (const adjustment of orderedAdjustments) {
    if (!Number.isFinite(adjustment.handicap) || !Number.isFinite(Date.parse(adjustment.effectiveAt))) throw new Error('Invalid manual handicap adjustment.');
  }
  const lastAdjustment = orderedAdjustments.at(-1);
  const lastRound = ordered.at(-1);
  if (lastAdjustment && (!lastRound || Date.parse(lastAdjustment.effectiveAt) > Date.parse(lastRound.playedAt))) {
    index = lastAdjustment.handicap;
    status = 'manual';
  }
  return {
    policy: LEAGUE_HANDICAP_POLICY, multiplier, basis, status, bestRounds: x, historyWindow: y,
    eligibleRounds: ordered.length, entries, usedEntries, average: average == null ? null : roundHandicap(average),
    maximumAdjustment: modifiedAverage == null ? 0 : roundHandicap(Math.min(maximum, modifiedAverage) - modifiedAverage),
    index, overrides: orderedAdjustments.length,
  };
}
