import { describe, expect, it } from 'vitest';
import { toHandicapSourceRound } from './playerHandicapHistory';

describe('handicap source scores', () => {
  const round = {
    id: 1, holesPlayed: 9, gross: 45, net: 36, adjusted: 41, courseRating: 36, courseSlope: 113,
    event: { id: 1, name: 'Week 1', startsAt: new Date('2026-01-01') },
    scores: Array.from({ length: 9 }, (_, index) => ({ hole: index + 1, gross: 5 })),
  };
  it('preserves the recorded scoring totals independently of handicap normalization', () => {
    expect(toHandicapSourceRound(round, 18)[0]).toMatchObject({ gross: 45, net: 36, adjustedGross: 41, differential: 10 });
  });
  it('preserves zero net and does not fabricate an unavailable net', () => {
    expect(toHandicapSourceRound({ ...round, net: 0 }, 9)[0].net).toBe(0);
    expect(toHandicapSourceRound({ ...round, gross: undefined, net: undefined }, 9)[0]).toMatchObject({ gross: 45, net: null });
  });
});
