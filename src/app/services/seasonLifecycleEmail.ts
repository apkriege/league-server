import { getPrimaryClientOrigin } from '../utils/origins';
import { EmailResult, escapeEmailHtml, sendAppEmail } from './email';

export const sendSeasonRenewalReminderEmail = async (input: {
  leagueId: number;
  leagueName: string;
  endDate: Date;
  email: string;
  firstName: string;
}): Promise<EmailResult> => {
  const renewalUrl = `${getPrimaryClientOrigin() || 'http://localhost:5173'}/leagues/create?renewFrom=${input.leagueId}`;
  const endDate = input.endDate.toISOString().slice(0, 10);
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hello,';
  return sendAppEmail({
    to: input.email,
    subject: `Renew ${input.leagueName} for its next season`,
    text: [
      greeting,
      '',
      `${input.leagueName} ends on ${endDate}.`,
      'Create the next season to keep the roster, teams, handicaps, and scoring-period setup while preserving prior results.',
      '',
      renewalUrl,
      '',
      'Past seasons become read-only after their end date.',
    ].join('\n'),
    html: `
      <p>${escapeEmailHtml(greeting)}</p>
      <p><strong>${escapeEmailHtml(input.leagueName)}</strong> ends on ${endDate}.</p>
      <p>Create the next season to keep the roster, teams, handicaps, and scoring-period setup while preserving prior results.</p>
      <p><a href="${escapeEmailHtml(renewalUrl)}">Renew this league</a></p>
      <p>Past seasons become read-only after their end date.</p>
    `.trim(),
    tags: [{ name: 'category', value: 'season-renewal' }],
    idempotencyKey: `season-renewal-${input.leagueId}-${endDate}`,
  });
};
