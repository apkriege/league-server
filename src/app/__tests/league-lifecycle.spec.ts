import { describe, expect, it } from 'vitest';
import { getLeagueMutationBlock } from '../services/leagueLifecycle';

const endedSeason = {
  type: 'season',
  endDate: new Date('2020-01-01T00:00:00.000Z'),
  entitlement: {
    requiredGolfers: 8,
    paidGolfers: 8,
    refundedGolfers: 0,
    status: 'consumed',
  },
};

describe('league season lifecycle', () => {
  it('locks an expired or archived season', () => {
    expect(getLeagueMutationBlock({ ...endedSeason, seasonStatus: 'active' })).toMatchObject({
      status: 409,
      code: 'LEAGUE_ARCHIVED',
    });
    expect(getLeagueMutationBlock({ ...endedSeason, seasonStatus: 'archived' })).toMatchObject({
      code: 'LEAGUE_ARCHIVED',
    });
  });

  it('allows an audited super-admin reopen but still locks payment-due seasons', () => {
    expect(getLeagueMutationBlock({ ...endedSeason, seasonStatus: 'reopened' })).toBeNull();
    expect(
      getLeagueMutationBlock({
        ...endedSeason,
        seasonStatus: 'reopened',
        entitlement: {
          requiredGolfers: 8,
          paidGolfers: 8,
          refundedGolfers: 1,
          status: 'partially_refunded',
        },
      }),
    ).toMatchObject({ status: 402, code: 'LEAGUE_PAYMENT_DUE' });
  });
});
