import { getLeagueRoundProgress } from '../utils/league-round-progress';

describe('getLeagueRoundProgress', () => {
  it('counts completed playable events and excludes canceled and off weeks', () => {
    expect(
      getLeagueRoundProgress([
        { status: 'completed', type: 'regular' },
        { status: 'upcoming', type: 'regular' },
        { status: 'canceled', type: 'regular' },
        { status: 'upcoming', type: 'off' },
      ]),
    ).toEqual({ completedRoundCount: 1, roundCount: 2 });
  });

  it('does not infer completion from an active event', () => {
    expect(
      getLeagueRoundProgress([{ status: 'active', type: 'regular' }]),
    ).toEqual({ completedRoundCount: 0, roundCount: 1 });
  });
});
