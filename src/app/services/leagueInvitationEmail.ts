import { EmailResult, escapeEmailHtml, sendAppEmail } from './email';
import { getPrimaryClientOrigin } from '../utils/origins';

type LeagueInvitationEmailInput = {
  invitationId: number;
  token: string;
  email: string;
  playerName: string;
  leagueName: string;
};

export const sendLeagueInvitationEmail = async (
  input: LeagueInvitationEmailInput,
): Promise<EmailResult> => {
  const clientOrigin = getPrimaryClientOrigin() || 'http://localhost:5173';
  const invitationUrl = `${clientOrigin}/invite/${encodeURIComponent(input.token)}`;
  const subject = `Join ${input.leagueName} on League Night Pro`;
  const text = [
    `Hi ${input.playerName},`,
    '',
    `You have been invited to claim your player profile for ${input.leagueName}.`,
    `Open this link to sign in or create an account: ${invitationUrl}`,
    '',
    'This invitation expires in 30 days.',
  ].join('\n');
  const html = `
    <h2>Join ${escapeEmailHtml(input.leagueName)}</h2>
    <p>Hi ${escapeEmailHtml(input.playerName)},</p>
    <p>You have been invited to claim your player profile on League Night Pro.</p>
    <p><a href="${escapeEmailHtml(invitationUrl)}">Claim your player profile</a></p>
    <p>This invitation expires in 30 days.</p>
  `.trim();

  return sendAppEmail({
    to: [input.email],
    subject,
    text,
    html,
    tags: [{ name: 'category', value: 'league-invitation' }],
    idempotencyKey: `league-invitation-${input.invitationId}`,
  });
};
