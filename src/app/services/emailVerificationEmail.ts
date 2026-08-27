import { getPrimaryClientOrigin } from '../utils/origins';
import { EmailResult, escapeEmailHtml, sendAppEmail } from './email';

type EmailVerificationInput = {
  userId: number;
  email: string;
  firstName: string;
  token: string;
};

export const sendEmailVerificationEmail = async (
  input: EmailVerificationInput,
): Promise<EmailResult> => {
  const clientOrigin = getPrimaryClientOrigin() || 'http://localhost:5173';
  const verificationUrl = `${clientOrigin}/verify-email?token=${encodeURIComponent(input.token)}`;
  const name = input.firstName.trim() || 'there';
  const text = [
    `Hi ${name},`,
    '',
    'Verify your League Night Pro email address:',
    verificationUrl,
    '',
    'This one-time link expires in 24 hours. If you did not create this account, you can ignore this email.',
  ].join('\n');
  const html = `
    <h2>Verify your League Night Pro email</h2>
    <p>Hi ${escapeEmailHtml(name)},</p>
    <p><a href="${escapeEmailHtml(verificationUrl)}">Verify email address</a></p>
    <p>This one-time link expires in 24 hours. If you did not create this account, you can ignore this email.</p>
  `.trim();

  return sendAppEmail({
    to: [input.email],
    subject: 'Verify your League Night Pro email',
    text,
    html,
    tags: [{ name: 'category', value: 'email-verification' }],
    idempotencyKey: `email-verification-user-${input.userId}-${input.token.slice(0, 12)}`,
  });
};
