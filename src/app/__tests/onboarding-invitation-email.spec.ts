import { beforeEach, describe, expect, it, vi } from 'vitest';
const send = vi.hoisted(() => vi.fn().mockResolvedValue({ status: 'sent' }));
vi.mock('../services/email', () => ({ sendAppEmail: send, escapeEmailHtml: (value: string) => value }));
vi.mock('../utils/origins', () => ({ getPrimaryClientOrigin: () => 'https://test.example.com' }));
import { sendLeagueInvitationEmail } from '../services/leagueInvitationEmail';

const input = { invitationId: 1, token: 'token', email: 'golfer@test.com', playerName: 'Golfer', leagueName: 'League' };
describe('intentional invitation resend', () => {
  beforeEach(() => vi.clearAllMocks());
  it('keeps initial delivery idempotent', async () => {
    await sendLeagueInvitationEmail(input);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'league-invitation-1' }));
  });
  it('uses a distinct delivery key while keeping the same invitation link', async () => {
    await sendLeagueInvitationEmail({ ...input, deliveryKey: 'resend-one' });
    await sendLeagueInvitationEmail({ ...input, deliveryKey: 'resend-two' });
    expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ idempotencyKey: 'league-invitation-1-resend-one', text: expect.stringContaining('/invite/token') }));
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ idempotencyKey: 'league-invitation-1-resend-two' }));
  });
});
