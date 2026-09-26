import { describe, expect, it } from 'vitest';
import { getRequiredTeamPlayers, resolveTeamEventLineups } from '../services/teamLineups';

const league = {
  players: [
    { id: 1, teamId: 10, type: 'player' },
    { id: 2, teamId: 10, type: 'player' },
    { id: 3, teamId: 10, type: 'player' },
    { id: 4, teamId: 20, type: 'player' },
    { id: 5, teamId: 20, type: 'player' },
    { id: 6, teamId: null, type: 'substitute' },
  ],
  teams: [
    { id: 10, name: 'A', players: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    { id: 20, name: 'B', players: [{ id: 4 }, { id: 5 }] },
  ],
};

describe('team event lineups', () => {
  it('uses the league default and enforces fixed-format counts', () => {
    expect(getRequiredTeamPlayers({ requested: null, leagueDefault: 3, scoringMode: 'stroke-play' })).toBe(3);
    expect(() => getRequiredTeamPlayers({ requested: 3, leagueDefault: 2, scoringMode: 'alternate-shot' })).toThrow(/exactly two/i);
    expect(() => getRequiredTeamPlayers({ requested: 1, leagueDefault: 2, scoringMode: 'best-ball' })).toThrow(/at least two/i);
  });

  it('allows team members and substitutes while preserving the permanent roster', () => {
    const result = resolveTeamEventLineups({
      league,
      flights: [[10, 20]],
      requiredPlayers: 2,
      lineups: [
        { teamId: 10, playerIds: [1, 6] },
        { teamId: 20, playerIds: [4, 5] },
      ],
    });
    expect(result.lineups).toEqual([
      { teamId: 10, playerIds: [1, 6] },
      { teamId: 20, playerIds: [4, 5] },
    ]);
    expect(league.teams[0].players).toHaveLength(3);
  });

  it('requires an explicit choice when a roster is larger than the event lineup', () => {
    expect(() => resolveTeamEventLineups({
      league,
      flights: [[10, 20]],
      requiredPlayers: 2,
      lineups: [],
    })).toThrow(/must have exactly 2 selected/i);
  });

  it('requires all three selections for a three-player event', () => {
    const threePlayerLeague = {
      players: [...league.players, { id: 7, teamId: 20, type: 'player' }],
      teams: [
        league.teams[0],
        { ...league.teams[1], players: [{ id: 4 }, { id: 5 }, { id: 7 }] },
      ],
    };
    expect(resolveTeamEventLineups({
      league: threePlayerLeague,
      flights: [[10, 20]],
      requiredPlayers: 3,
      lineups: [
        { teamId: 10, playerIds: [1, 2, 3] },
        { teamId: 20, playerIds: [4, 5, 7] },
      ],
    }).lineups).toHaveLength(2);
  });
});
