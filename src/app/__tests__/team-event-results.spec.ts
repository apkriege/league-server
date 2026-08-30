import { buildTeamEventResults, type TeamProfileEvent } from '../utils/team-event-results';

const event = (overrides: Partial<TeamProfileEvent> = {}): TeamProfileEvent => ({
  id: 10,
  name: 'Week 1',
  startsAt: '2026-05-01T21:00:00.000Z',
  timeZone: 'America/Indiana/Indianapolis',
  format: 'team',
  scoringMode: 'match-play',
  type: 'regular',
  status: 'completed',
  holes: 9,
  course: { name: 'Fortress' },
  teamEventPoints: [
    { teamId: 1, points: 2 },
    { teamId: 2, points: 1 },
  ],
  flights: [
    {
      id: 30,
      startsAt: '2026-05-01T21:10:00.000Z',
      teams: [
        { teamId: 1, opponentId: 2, team: { id: 1, name: 'Aces' } },
        { teamId: 2, opponentId: 1, team: { id: 2, name: 'Birdies' } },
      ],
      players: [
        { playerId: 100, teamId: 1, player: { teamId: 1 } },
        { playerId: 200, teamId: 2, player: { teamId: 2 } },
      ],
    },
  ],
  rounds: [
    {
      id: 40,
      playerId: 100,
      date: '2026-05-01',
      gross: 42,
      net: 37,
      pointsEarned: 4.5,
      matchPoints: 1,
      eagles: 0,
      birdies: 1,
      pars: 4,
      bogeys: 3,
      player: { id: 100, firstName: 'Ada', lastName: 'Lovelace' },
    },
    {
      id: 41,
      playerId: 200,
      date: '2026-05-01',
      gross: 44,
      net: 39,
      pointsEarned: 3,
      matchPoints: 0,
      eagles: 0,
      birdies: 0,
      pars: 3,
      bogeys: 4,
      player: { id: 200, firstName: 'Grace', lastName: 'Hopper' },
    },
  ],
  ...overrides,
});

describe('buildTeamEventResults', () => {
  it('combines assigned player and team points and resolves the opponent', () => {
    const [result] = buildTeamEventResults(1, [event()]);

    expect(result.opponents).toEqual([
      {
        id: 2,
        name: 'Birdies',
        playerPoints: 3,
        teamPoints: 1,
        totalPoints: 4,
      },
    ]);
    expect(result.playerPoints).toBe(5.5);
    expect(result.teamPoints).toBe(2);
    expect(result.totalPoints).toBe(7.5);
    expect(result.playerRounds).toHaveLength(1);
    expect(result.playerRounds[0].playerName).toBe('Ada Lovelace');
  });

  it('returns every scheduled event with pending points when no result exists', () => {
    const [result] = buildTeamEventResults(
      1,
      [
        event({
          id: 11,
          status: 'upcoming',
          teamEventPoints: [],
          flights: [],
          rounds: [],
        }),
      ],
    );

    expect(result.id).toBe(11);
    expect(result.isAssigned).toBe(false);
    expect(result.opponents).toEqual([]);
    expect(result.totalPoints).toBeNull();
  });

  it('uses the recorded event assignment instead of a player’s current team', () => {
    const reassignedEvent = event({
      flights: [
        {
          id: 31,
          startsAt: '2026-05-01T21:10:00.000Z',
          teams: [
            { teamId: 1, opponentId: 2, team: { id: 1, name: 'Aces' } },
            { teamId: 2, opponentId: 1, team: { id: 2, name: 'Birdies' } },
          ],
          players: [{ playerId: 100, teamId: 2, player: { teamId: 1 } }],
        },
      ],
    });

    const [result] = buildTeamEventResults(1, [reassignedEvent]);
    expect(result.playerRounds).toEqual([]);
    expect(result.playerPoints).toBe(0);
  });
});
