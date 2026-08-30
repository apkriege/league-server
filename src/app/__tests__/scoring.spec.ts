import { describe, expect, it } from 'vitest';
import {
  assignBestBallPoints,
  assignMaximumScorePoints,
  assignMatchPlayPoints,
  assignStablefordPoints,
  assignStrokePlayPoints,
  calculateAlternateShotHandicap,
  calculateFourBallMatch,
  calculateScrambleTeamScore,
  calculateScrambleHandicap,
  getScoringMode,
  modelSharedTeamRound,
  normalizeScoringConfiguration,
  validateScoringMode,
  type ScoringRound,
  type TeamEventPointsAccumulator,
} from '../scoring';

const buildRound = ({
  playerId,
  teamId = null,
  opponentId = null,
  gross,
  net,
}: {
  playerId: number;
  teamId?: number | null;
  opponentId?: number | null;
  gross: number;
  net: number;
}): ScoringRound => ({
  playerId,
  teamId,
  opponentId,
  courseHandicap: 0,
  gross,
  net,
  scores: [
    {
      id: playerId,
      hole: 1,
      par: 4,
      gross,
      adjusted: gross,
      net,
      pops: 0,
    },
  ],
  pointsEarned: 0,
  matchPoints: 0,
});

const event = { id: 10, leagueId: 20 };
const holes = [{ num: 1, par: 4, hcp: 1 }];

const buildMultiHoleRound = ({
  playerId,
  opponentId = null,
  teamId = null,
  grossScores,
  courseHandicap = 0,
}: {
  playerId: number;
  opponentId?: number | null;
  teamId?: number | null;
  grossScores: number[];
  courseHandicap?: number;
}): ScoringRound => ({
  playerId,
  opponentId,
  teamId,
  courseHandicap,
  gross: grossScores.reduce((sum, score) => sum + score, 0),
  net: grossScores.reduce((sum, score) => sum + score, 0),
  scores: grossScores.map((gross, index) => ({
    id: playerId * 10 + index,
    hole: index + 1,
    par: 4,
    gross,
    adjusted: gross,
    net: gross,
    pops: 0,
  })),
  pointsEarned: 0,
  matchPoints: 0,
});

describe('scoring calculators', () => {
  it('splits stroke-play placement points across exact ties', () => {
    const leader = buildRound({ playerId: 1, gross: 38, net: 34 });
    const tiedA = buildRound({ playerId: 2, gross: 40, net: 36 });
    const tiedB = buildRound({ playerId: 3, gross: 40, net: 36 });

    assignStrokePlayPoints({ ...event, strokePoints: [10, 6, 4] }, [leader, tiedA, tiedB]);

    expect([leader.pointsEarned, tiedA.pointsEarned, tiedB.pointsEarned]).toEqual([10, 5, 5]);
  });

  it('awards match-play hole and match points from the same head-to-head result', () => {
    const left = buildRound({ playerId: 1, opponentId: 2, gross: 4, net: 4 });
    const right = buildRound({ playerId: 2, opponentId: 1, gross: 5, net: 5 });

    assignMatchPlayPoints({
      event: { ...event, ptsPerHole: 1, ptsPerMatch: 2 },
      holes,
      rounds: [left, right],
    });

    expect({ hole: left.pointsEarned, match: left.matchPoints }).toEqual({ hole: 1, match: 2 });
    expect({ hole: right.pointsEarned, match: right.matchPoints }).toEqual({ hole: 0, match: 0 });
  });

  it('decides match play by holes won instead of aggregate strokes', () => {
    const matchHoles = [1, 2, 3].map((num) => ({ num, par: 4, hcp: num }));
    const left = buildMultiHoleRound({
      playerId: 1,
      opponentId: 2,
      grossScores: [4, 4, 10],
    });
    const right = buildMultiHoleRound({
      playerId: 2,
      opponentId: 1,
      grossScores: [5, 5, 3],
    });

    assignMatchPlayPoints({
      event: { ...event, ptsPerHole: 1, ptsPerMatch: 2 },
      holes: matchHoles,
      rounds: [left, right],
    });

    expect({ holes: left.pointsEarned, match: left.matchPoints }).toEqual({ holes: 2, match: 2 });
    expect({ holes: right.pointsEarned, match: right.matchPoints }).toEqual({ holes: 1, match: 0 });
  });

  it('uses each team best net score for best-ball points', () => {
    const rounds = [
      buildRound({ playerId: 1, teamId: 100, gross: 3, net: 3 }),
      buildRound({ playerId: 2, teamId: 100, gross: 5, net: 5 }),
      buildRound({ playerId: 3, teamId: 200, gross: 4, net: 4 }),
      buildRound({ playerId: 4, teamId: 200, gross: 6, net: 6 }),
    ];
    const teamPoints: TeamEventPointsAccumulator = new Map();

    assignBestBallPoints({
      event: { ...event, strokePoints: [5, 2] },
      holes,
      flights: [
        {
          teams: [{ teamId: 100 }, { teamId: 200 }],
          players: rounds.map((round) => ({ playerId: round.playerId, teamId: round.teamId })),
        },
      ],
      roundsByPlayerId: new Map(rounds.map((round) => [round.playerId, round])),
      teamPoints,
    });

    expect(teamPoints.get('100:10')?.points).toBe(5);
    expect(teamPoints.get('200:10')?.points).toBe(2);
    expect(rounds.every((round) => round.pointsEarned === 0)).toBe(true);
  });

  it('calculates a shared scramble team score and rejects duplicate holes', () => {
    expect(
      calculateScrambleTeamScore([
        { hole: 1, par: 4, gross: 4, net: 3 },
        { hole: 2, par: 5, gross: 5, net: 5 },
      ]),
    ).toEqual({ holesPlayed: 2, gross: 9, net: 8, stablefordPoints: 5, cappedHoles: 0 });

    expect(() =>
      calculateScrambleTeamScore([
        { hole: 1, par: 4, gross: 4, net: 4 },
        { hole: 1, par: 4, gross: 5, net: 5 },
      ]),
    ).toThrow('one valid score per hole');
  });

  it('supports configurable Stableford and maximum-score competition points', () => {
    const stablefordRound = buildRound({ playerId: 1, gross: 3, net: 3 });
    assignStablefordPoints(
      {
        ...event,
        scoringConfig: {
          stablefordPointScale: {
            albatrossOrBetter: 9,
            eagle: 6,
            birdie: 4,
            par: 2,
            bogey: 1,
            doubleBogeyOrWorse: 0,
          },
        },
      },
      [stablefordRound],
    );
    expect(stablefordRound.pointsEarned).toBe(4);

    const cappedA = buildRound({ playerId: 2, gross: 10, net: 10 });
    const cappedB = buildRound({ playerId: 3, gross: 7, net: 7 });
    assignMaximumScorePoints(
      {
        ...event,
        strokePoints: [10, 6],
        scoringConfig: { maximumScore: { type: 'fixed', strokes: 6 } },
      },
      [cappedA, cappedB],
    );
    expect([cappedA.pointsEarned, cappedB.pointsEarned]).toEqual([8, 8]);
  });

  it('models shared team scores with pops and a competition cap', () => {
    const configuration = normalizeScoringConfiguration(
      { maximumScore: { type: 'relative-to-par', strokesOverPar: 2 } },
      'scramble',
    );
    const result = modelSharedTeamRound({
      mode: 'scramble',
      holes: [
        { num: 1, par: 4, hcp: 1 },
        { num: 2, par: 5, hcp: 2 },
      ],
      rawScores: { 1: 10, 2: 5 },
      courseHandicap: 1,
      configuration,
    });

    expect(result).toMatchObject({ holesPlayed: 2, gross: 15, adjusted: 11, net: 10 });
    expect(result.scores[0]).toMatchObject({ gross: 10, adjusted: 6, net: 5, popsReceived: 1 });
    expect(() =>
      modelSharedTeamRound({
        mode: 'scramble',
        holes: [{ num: 1, par: 4, hcp: 1 }],
        rawScores: {},
        courseHandicap: 0,
        configuration,
      }),
    ).toThrow('one valid stroke total for every hole');
  });

  it('calculates standard scramble and alternate-shot team handicaps', () => {
    expect(calculateScrambleHandicap([10, 20])).toBe(7);
    expect(calculateAlternateShotHandicap([10, 20])).toBe(15);
  });

  it('scores four-ball from each side best net score', () => {
    const leftRounds = [
      buildMultiHoleRound({ playerId: 1, teamId: 100, grossScores: [4, 6] }),
      buildMultiHoleRound({ playerId: 2, teamId: 100, grossScores: [5, 4] }),
    ];
    const rightRounds = [
      buildMultiHoleRound({ playerId: 3, teamId: 200, grossScores: [5, 5] }),
      buildMultiHoleRound({ playerId: 4, teamId: 200, grossScores: [6, 5] }),
    ];
    const result = calculateFourBallMatch({
      holes: [
        { num: 1, par: 4, hcp: 1 },
        { num: 2, par: 4, hcp: 2 },
      ],
      left: { teamId: 100, rounds: leftRounds },
      right: { teamId: 200, rounds: rightRounds },
      pointsPerHole: 1,
      pointsPerMatch: 2,
    });
    expect(result).toMatchObject({
      leftHolesWon: 2,
      rightHolesWon: 0,
      leftHolePoints: 2,
      leftMatchPoints: 2,
    });
    expect(() =>
      calculateFourBallMatch({
        holes: [{ num: 1, par: 4, hcp: 1 }],
        left: { teamId: 100, rounds: leftRounds.slice(0, 1) },
        right: { teamId: 200, rounds: rightRounds },
      }),
    ).toThrow('exactly two players on each side');
  });

  it('enforces which formats apply to individual and team events', () => {
    expect(getScoringMode('foursomes').id).toBe('alternate-shot');
    expect(validateScoringMode('stableford', 'individual').id).toBe('stableford');
    expect(() => validateScoringMode('scramble', 'individual')).toThrow(
      'not available for individual competition',
    );
  });
});
