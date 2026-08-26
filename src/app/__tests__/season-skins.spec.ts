import { describe, expect, it } from 'vitest';
import { calculateSeasonSkinLeaderboards, type SeasonSkinScore } from '../utils/season-skins';

const score = (
  eventId: number,
  hole: number,
  playerId: number,
  gross: number,
  net: number,
): SeasonSkinScore => ({
  eventId,
  hole,
  playerId,
  playerName: `Player ${playerId}`,
  gross,
  net,
});

describe('season skins', () => {
  it('counts unique gross and net winners independently across events', () => {
    const leaderboards = calculateSeasonSkinLeaderboards([
      score(10, 1, 1, 3, 3),
      score(10, 1, 2, 4, 2),
      score(11, 1, 1, 4, 3),
      score(11, 1, 2, 5, 4),
    ]);

    expect(leaderboards.gross).toEqual([
      { playerId: 1, name: 'Player 1', skins: 2 },
    ]);
    expect(leaderboards.net).toEqual([
      { playerId: 1, name: 'Player 1', skins: 1 },
      { playerId: 2, name: 'Player 2', skins: 1 },
    ]);
  });

  it('does not award a tied hole when a later score is higher', () => {
    const leaderboards = calculateSeasonSkinLeaderboards([
      score(10, 1, 1, 4, 4),
      score(10, 1, 2, 4, 4),
      score(10, 1, 3, 5, 5),
    ]);

    expect(leaderboards).toEqual({ gross: [], net: [] });
  });
});
