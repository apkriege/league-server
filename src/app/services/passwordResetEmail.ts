import { EmailResult, escapeEmailHtml, sendAppEmail } from './email';
import { getPrimaryClientOrigin } from '../utils/origins';

type PasswordResetEmailInput = {
  userId: number;
  email: string;
  firstName: string;
  token: string;
};

export const sendPasswordResetEmail = async (
  input: PasswordResetEmailInput,
): Promise<EmailResult> => {
  const clientOrigin = getPrimaryClientOrigin() || 'http://localhost:5173';
  const resetUrl = `${clientOrigin}/reset-password?token=${encodeURIComponent(input.token)}`;
  const name = input.firstName.trim() || 'there';
  const text = [
    `Hi ${name},`,
    '',
    'Use the link below to reset your League Night Pro password:',
    resetUrl,
    '',
    'This link expires in one hour. If you did not request it, you can ignore this email.',
  ].join('\n');
  const html = `
    <h2>Reset your League Night Pro password</h2>
    <p>Hi ${escapeEmailHtml(name)},</p>
    <p><a href="${escapeEmailHtml(resetUrl)}">Reset your password</a></p>
    <p>This link expires in one hour. If you did not request it, you can ignore this email.</p>
  `.trim();

  return sendAppEmail({
    to: [input.email],
    subject: 'Reset your League Night Pro password',
    text,
    html,
    tags: [{ name: 'category', value: 'password-reset' }],
    idempotencyKey: `password-reset-user-${input.userId}-${input.token.slice(0, 12)}`,
  });
};
