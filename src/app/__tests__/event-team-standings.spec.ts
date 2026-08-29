import { describe, expect, it } from 'vitest';
import { calculateEventTeamStandings } from '../utils/event-team-standings';

describe('event team standings', () => {
  it('combines each player total with the separately awarded team points', () => {
    const standings = calculateEventTeamStandings(
      [
        { teamId: 10, name: 'Team Ten' },
        { teamId: 20, name: 'Team Twenty' },
      ],
      [
        { playerId: 1, teamId: 10 },
        { playerId: 2, teamId: 10 },
        { playerId: 3, teamId: 20 },
      ],
      [
        { teamId: 10, points: 2 },
        { teamId: 20, points: 0 },
      ],
      [
        {
          playerId: 1,
          pointsEarned: 4,
          matchPoints: 1,
          player: { firstName: 'Alex', lastName: 'Ace' },
        },
        {
          playerId: 2,
          pointsEarned: 3,
          matchPoints: 1,
          player: { firstName: 'Blake', lastName: 'Birdie' },
        },
        {
          playerId: 3,
          pointsEarned: 6,
          matchPoints: 1,
          player: { firstName: 'Casey', lastName: 'Chip' },
        },
      ],
    );

    expect(standings[0]).toMatchObject({
      rank: 1,
      teamId: 10,
      playerPoints: 9,
      teamPoints: 2,
      totalPoints: 11,
    });
    expect(standings[0].players).toEqual([
      { playerId: 1, name: 'Alex Ace', points: 5 },
      { playerId: 2, name: 'Blake Birdie', points: 4 },
    ]);
    expect(standings[1]).toMatchObject({ rank: 2, teamId: 20, totalPoints: 7 });
  });

  it('keeps assigned teams visible when no team-points row exists', () => {
    const standings = calculateEventTeamStandings(
      [
        { teamId: 10, name: 'Team Ten' },
        { teamId: 20, name: 'Team Twenty' },
      ],
      [],
      [],
      [],
    );

    expect(standings).toEqual([
      {
        rank: 1,
        teamId: 10,
        name: 'Team Ten',
        players: [],
        playerPoints: 0,
        teamPoints: 0,
        totalPoints: 0,
      },
      {
        rank: 1,
        teamId: 20,
        name: 'Team Twenty',
        players: [],
        playerPoints: 0,
        teamPoints: 0,
        totalPoints: 0,
      },
    ]);
  });
});
