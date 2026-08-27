import { describe, expect, it } from 'vitest';
import { calculatePlayerResults, type PlayerResultsRound } from '../utils/player-results';

const players = [
  { id: 1, firstName: 'Alex', lastName: 'Ace' },
  { id: 2, firstName: 'Blake', lastName: 'Birdie' },
  { id: 3, firstName: 'Casey', lastName: 'Chip' },
];

const round = (
  playerId: number,
  eventId: number,
  pointsEarned: number,
  matchPoints: number,
): PlayerResultsRound => ({
  playerId,
  eventId,
  gross: 40 + playerId,
  net: 35 + playerId,
  pointsEarned,
  matchPoints,
  eagles: playerId === 1 ? 1 : 0,
  birdies: playerId,
  pars: 5,
  player: players.find((player) => player.id === playerId)!,
});

describe('player results', () => {
  it('aggregates rounds and includes league players without completed events', () => {
    const results = calculatePlayerResults(players, [
      round(1, 10, 4, 1),
      round(1, 11, 3, 1),
      round(2, 10, 8, 1),
    ]);

    expect(results).toEqual([
      {
        rank: 1,
        playerId: 1,
        name: 'Alex Ace',
        eventsPlayed: 2,
        totalGross: 82,
        totalNet: 72,
        totalPoints: 9,
        eagles: 2,
        birdies: 2,
        pars: 10,
      },
      {
        rank: 1,
        playerId: 2,
        name: 'Blake Birdie',
        eventsPlayed: 1,
        totalGross: 42,
        totalNet: 37,
        totalPoints: 9,
        eagles: 0,
        birdies: 2,
        pars: 5,
      },
      {
        rank: 3,
        playerId: 3,
        name: 'Casey Chip',
        eventsPlayed: 0,
        totalGross: 0,
        totalNet: 0,
        totalPoints: 0,
        eagles: 0,
        birdies: 0,
        pars: 0,
      },
    ]);
  });
});
