import { describe, expect, it } from 'vitest';
import { resolveScoreSubmissionOpponents } from '../utils/score-opponents';

describe('score submission opponents', () => {
  it('accepts reciprocal opponents for a legacy team flight without saved pairings', () => {
    const opponents = resolveScoreSubmissionOpponents({
      eventFormat: 'team',
      scoringFamily: 'match',
      assignments: [
        { playerId: 1, teamId: 10, opponentId: null },
        { playerId: 2, teamId: 20, opponentId: null },
      ],
      submittedPlayers: [
        { playerId: 1, opponentId: 2 },
        { playerId: 2, opponentId: 1 },
      ],
    });

    expect([...opponents.entries()]).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });

  it('continues to enforce opponent assignments when the flight has them', () => {
    expect(() =>
      resolveScoreSubmissionOpponents({
        eventFormat: 'individual',
        scoringFamily: 'match',
        assignments: [
          { playerId: 1, opponentId: 2 },
          { playerId: 2, opponentId: 1 },
        ],
        submittedPlayers: [
          { playerId: 1, opponentId: null },
          { playerId: 2, opponentId: 1 },
        ],
      }),
    ).toThrow('must match the flight assignments');
  });

  it('rejects non-reciprocal legacy-flight opponents', () => {
    expect(() =>
      resolveScoreSubmissionOpponents({
        eventFormat: 'team',
        scoringFamily: 'match',
        assignments: [
          { playerId: 1, teamId: 10, opponentId: null },
          { playerId: 2, teamId: 20, opponentId: null },
        ],
        submittedPlayers: [
          { playerId: 1, opponentId: 2 },
          { playerId: 2, opponentId: null },
        ],
      }),
    ).toThrow('must be reciprocal matchups within the flight');
  });

  it('does not carry opponent metadata into stroke-play rounds', () => {
    const opponents = resolveScoreSubmissionOpponents({
      eventFormat: 'individual',
      scoringFamily: 'stroke',
      assignments: [{ playerId: 1, opponentId: 2 }],
      submittedPlayers: [{ playerId: 1, opponentId: 2 }],
    });

    expect(opponents.get(1)).toBeNull();
  });
});
