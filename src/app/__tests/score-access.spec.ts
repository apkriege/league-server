import { describe, expect, it } from 'vitest';
import { buildEventScoreAccess } from '../utils/score-order';

describe('event score access state', () => {
  it('allows scoring any active event and editing any event that has scores', () => {
    expect(
      buildEventScoreAccess({ status: 'active', _count: { rounds: 0 } }),
    ).toEqual({ canEnterScores: true, canEditScores: false });
    expect(
      buildEventScoreAccess({ status: 'active', _count: { rounds: 2 } }),
    ).toEqual({ canEnterScores: true, canEditScores: true });
    expect(
      buildEventScoreAccess({ status: 'completed', _count: { rounds: 2 } }),
    ).toEqual({ canEnterScores: false, canEditScores: true });
  });

  it('keeps canceled events read-only', () => {
    expect(
      buildEventScoreAccess({ status: 'canceled', _count: { rounds: 0 } }),
    ).toEqual({ canEnterScores: false, canEditScores: false });
  });
});
