import { describe, expect, it } from 'vitest';
import {
  assignBestBallPoints,
  assignFourBallMatchPoints,
  assignTeamAggregatePoints,
  assignMaximumScorePoints,
  assignMatchPlayPoints,
  assignStablefordPoints,
  assignStrokePlayPoints,
  applyMaximumScore,
  calculateAlternateShotHandicap,
  calculateFourBallMatch,
  calculateScrambleTeamScore,
  calculateScrambleHandicap,
  calculateSharedTeamPoints,
  getScoringMode,
  modelSharedTeamRound,
  normalizeScoringConfiguration,
  parsePlacementPoints,
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
  playerHandicap: 0,
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
  playerHandicap = 0,
}: {
  playerId: number;
  opponentId?: number | null;
  teamId?: number | null;
  grossScores: number[];
  playerHandicap?: number;
}): ScoringRound => ({
  playerId,
  opponentId,
  teamId,
  playerHandicap,
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

  it('uses the winning player scorecard par for mixed-card best-ball Stableford', () => {
    const left = buildRound({ playerId: 1, teamId: 100, gross: 4, net: 4 });
    left.scores[0].par = 5;
    const right = buildRound({ playerId: 2, teamId: 200, gross: 4, net: 4 });
    const teamPoints: TeamEventPointsAccumulator = new Map();

    assignBestBallPoints({
      event,
      holes,
      flights: [{
        teams: [{ teamId: 100 }, { teamId: 200 }],
        players: [
          { playerId: left.playerId, teamId: left.teamId },
          { playerId: right.playerId, teamId: right.teamId },
        ],
      }],
      roundsByPlayerId: new Map([[left.playerId, left], [right.playerId, right]]),
      teamPoints,
    });

    expect(teamPoints.get('100:10')?.points).toBe(3);
    expect(teamPoints.get('200:10')?.points).toBe(2);
  });

  it('applies allowances to player handicaps without tee-par adjustments', () => {
    const lowerPar = buildRound({ playerId: 1, gross: 4, net: 4 });
    const higherPar = buildRound({ playerId: 2, gross: 4, net: 4 });
    lowerPar.playerHandicap = 0.51;
    higherPar.playerHandicap = 0.51;
    higherPar.scores[0].par = 5;

    assignStrokePlayPoints(
      { ...event, strokePoints: [5, 2], scoringConfig: { handicapAllowance: 0.9 } },
      [lowerPar, higherPar],
      holes,
    );

    expect(lowerPar.playingHandicap).toBe(0);
    expect(higherPar.playingHandicap).toBe(0);
    expect(lowerPar.competitionNet).toBe(4);
    expect(higherPar.competitionNet).toBe(4);
  });

  it('compares a match using player handicaps without tee-par adjustments', () => {
    const lowerPar = buildRound({ playerId: 1, opponentId: 2, gross: 4, net: 4 });
    const higherPar = buildRound({ playerId: 2, opponentId: 1, gross: 4, net: 4 });
    higherPar.scores[0].par = 5;

    assignMatchPlayPoints({
      event: { ...event, ptsPerHole: 1, ptsPerMatch: 2 },
      holes,
      rounds: [lowerPar, higherPar],
    });

    expect(lowerPar.playingHandicap).toBe(0);
    expect(higherPar.playingHandicap).toBe(0);
    expect(lowerPar.competitionNet).toBe(4);
    expect(higherPar.competitionNet).toBe(4);
    expect({ lower: lowerPar.pointsEarned, higher: higherPar.pointsEarned }).toEqual({
      lower: 0.5,
      higher: 0.5,
    });
  });

  it('treats blank placement points as absent and preserves an explicit zero place', () => {
    expect(parsePlacementPoints('')).toEqual([]);
    expect(parsePlacementPoints(['', null, '  '])).toEqual([]);
    expect(parsePlacementPoints([0])).toEqual([0]);
  });

  it('includes plus-handicap strokes in a maximum-score competition net', () => {
    expect(
      applyMaximumScore({
        gross: 8,
        par: 4,
        pops: -1,
        rule: { type: 'net-double-bogey' },
      }),
    ).toMatchObject({ gross: 5, net: 6, maximumGross: 5, wasCapped: true });
  });

  it('ranks aggregate team placement points across the entire event', () => {
    const rounds = [
      buildRound({ playerId: 1, teamId: 100, gross: 3, net: 3 }),
      buildRound({ playerId: 2, teamId: 200, gross: 4, net: 4 }),
      buildRound({ playerId: 3, teamId: 300, gross: 5, net: 5 }),
      buildRound({ playerId: 4, teamId: 400, gross: 6, net: 6 }),
    ];
    const teamPoints: TeamEventPointsAccumulator = new Map();

    assignTeamAggregatePoints({
      event: { ...event, strokePoints: [10, 8, 6, 4] },
      mode: 'stroke-play',
      holes,
      flights: [
        {
          teams: [{ teamId: 100 }, { teamId: 200 }],
          players: rounds.slice(0, 2).map((round) => ({
            playerId: round.playerId,
            teamId: round.teamId,
          })),
        },
        {
          teams: [{ teamId: 300 }, { teamId: 400 }],
          players: rounds.slice(2).map((round) => ({
            playerId: round.playerId,
            teamId: round.teamId,
          })),
        },
      ],
      roundsByPlayerId: new Map(rounds.map((round) => [round.playerId, round])),
      teamPoints,
    });

    expect([100, 200, 300, 400].map((teamId) => teamPoints.get(`${teamId}:10`)?.points)).toEqual([
      10, 8, 6, 4,
    ]);
  });

  it('ranks best-ball placement points across the entire event', () => {
    const rounds = [
      buildRound({ playerId: 1, teamId: 100, gross: 3, net: 3 }),
      buildRound({ playerId: 2, teamId: 200, gross: 4, net: 4 }),
      buildRound({ playerId: 3, teamId: 300, gross: 5, net: 5 }),
      buildRound({ playerId: 4, teamId: 400, gross: 6, net: 6 }),
    ];
    const teamPoints: TeamEventPointsAccumulator = new Map();

    assignBestBallPoints({
      event: { ...event, strokePoints: [10, 8, 6, 4] },
      holes,
      flights: [
        {
          teams: [{ teamId: 100 }, { teamId: 200 }],
          players: rounds.slice(0, 2).map((round) => ({
            playerId: round.playerId,
            teamId: round.teamId,
          })),
        },
        {
          teams: [{ teamId: 300 }, { teamId: 400 }],
          players: rounds.slice(2).map((round) => ({
            playerId: round.playerId,
            teamId: round.teamId,
          })),
        },
      ],
      roundsByPlayerId: new Map(rounds.map((round) => [round.playerId, round])),
      teamPoints,
    });

    expect([100, 200, 300, 400].map((teamId) => teamPoints.get(`${teamId}:10`)?.points)).toEqual([
      10, 8, 6, 4,
    ]);
  });

  it('ranks shared team rounds across the entire event', () => {
    expect(
      calculateSharedTeamPoints(
        [
          { teamId: 100, net: 30, stablefordPoints: 0 },
          { teamId: 200, net: 31, stablefordPoints: 0 },
          { teamId: 300, net: 32, stablefordPoints: 0 },
          { teamId: 400, net: 33, stablefordPoints: 0 },
        ],
        [10, 8, 6, 4],
      ),
    ).toEqual([
      { teamId: 100, points: 10 },
      { teamId: 200, points: 8 },
      { teamId: 300, points: 6 },
      { teamId: 400, points: 4 },
    ]);
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
            condorOrBetter: 10,
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

  it('uses standard Stableford albatross points and rejects negative scales', () => {
    const albatross = buildRound({ playerId: 1, gross: 1, net: 1 });
    assignStablefordPoints(event, [albatross]);
    expect(albatross.pointsEarned).toBe(5);
    expect(() =>
      normalizeScoringConfiguration(
        { stablefordPointScale: { birdie: -1 } },
        'stableford',
      ),
    ).toThrow(/0 or higher/i);
  });

  it('uses an explicitly selected scorecard for shared team formats', () => {
    expect(
      normalizeScoringConfiguration({ sharedTeamScorecard: 'female' }, 'scramble'),
    ).toMatchObject({ sharedTeamScorecard: 'female' });
    expect(() =>
      normalizeScoringConfiguration({ sharedTeamScorecard: 'mixed' }, 'alternate-shot'),
    ).toThrow(/male or female/i);
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
      playingHandicap: 1,
      configuration,
    });

    expect(result).toMatchObject({ holesPlayed: 2, gross: 15, adjusted: 11, net: 10 });
    expect(result.scores[0]).toMatchObject({ gross: 10, adjusted: 6, net: 5, popsReceived: 1 });
    expect(() =>
      modelSharedTeamRound({
        mode: 'scramble',
        holes: [{ num: 1, par: 4, hcp: 1 }],
        rawScores: {},
        playingHandicap: 0,
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

  it('ignores an unscored four-ball flight while another flight is complete', () => {
    const rounds = [
      buildRound({ playerId: 1, teamId: 100, gross: 4, net: 4 }),
      buildRound({ playerId: 2, teamId: 100, gross: 5, net: 5 }),
      buildRound({ playerId: 3, teamId: 200, gross: 5, net: 5 }),
      buildRound({ playerId: 4, teamId: 200, gross: 6, net: 6 }),
    ];
    const teamPoints: TeamEventPointsAccumulator = new Map();

    assignFourBallMatchPoints({
      event: { ...event, ptsPerHole: 1, ptsPerTeamWin: 2 },
      holes,
      flights: [
        {
          teams: [{ teamId: 100 }, { teamId: 200 }],
          players: rounds.map((round) => ({ playerId: round.playerId, teamId: round.teamId })),
        },
        {
          teams: [{ teamId: 300 }, { teamId: 400 }],
          players: [
            { playerId: 5, teamId: 300 },
            { playerId: 6, teamId: 300 },
            { playerId: 7, teamId: 400 },
            { playerId: 8, teamId: 400 },
          ],
        },
      ],
      roundsByPlayerId: new Map(rounds.map((round) => [round.playerId, round])),
      teamPoints,
    });

    expect(teamPoints.has('100:10')).toBe(true);
    expect(teamPoints.has('300:10')).toBe(false);
  });

  it('enforces which formats apply to individual and team events', () => {
    expect(getScoringMode('foursomes').id).toBe('alternate-shot');
    expect(validateScoringMode('stableford', 'individual').id).toBe('stableford');
    expect(() => validateScoringMode('scramble', 'individual')).toThrow(
      'not available for individual competition',
    );
  });
});
