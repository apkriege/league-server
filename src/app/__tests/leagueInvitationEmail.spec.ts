import { afterEach, describe, expect, it, vi } from 'vitest';

const { sendAppEmailMock } = vi.hoisted(() => ({ sendAppEmailMock: vi.fn() }));

vi.mock('../services/email', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/email')>();
  return { ...original, sendAppEmail: sendAppEmailMock };
});

import { sendLeagueInvitationEmail } from '../services/leagueInvitationEmail';

describe('league invitation email', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CLIENT_URL;
  });

  it('uses the shared email service and links to the claim page', async () => {
    process.env.CLIENT_URL = 'https://app.example.com';
    sendAppEmailMock.mockResolvedValue({ status: 'sent', emailId: 'email_1' });

    await sendLeagueInvitationEmail({
      invitationId: 12,
      token: 'invite-token',
      email: 'golfer@example.com',
      playerName: 'Test Golfer',
      leagueName: 'Thursday League',
    });

    expect(sendAppEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['golfer@example.com'],
        text: expect.stringContaining('https://app.example.com/invite/invite-token'),
        idempotencyKey: 'league-invitation-12',
      }),
    );
  });
});
