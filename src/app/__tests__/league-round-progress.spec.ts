import { getLeagueRoundProgress } from '../utils/league-round-progress';

describe('getLeagueRoundProgress', () => {
  it('counts completed playable events and excludes canceled and off weeks', () => {
    expect(
      getLeagueRoundProgress([
        { status: 'completed', type: 'regular', isComplete: true },
        { status: 'upcoming', type: 'regular', isComplete: false },
        { status: 'canceled', type: 'regular', isComplete: false },
        { status: 'upcoming', type: 'off', isComplete: false },
      ]),
    ).toEqual({ completedRoundCount: 1, roundCount: 2 });
  });

  it('recognizes the completion flag even before status is synchronized', () => {
    expect(
      getLeagueRoundProgress([{ status: 'active', type: 'regular', isComplete: true }]),
    ).toEqual({ completedRoundCount: 1, roundCount: 1 });
  });
});
