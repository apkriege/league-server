import { EmailResult, escapeEmailHtml, sendAppEmail } from './email';

type SignupUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role?: string | null;
};

const parseRecipients = (value: string | undefined) =>
  String(value || '')
    .split(/[,\s]+/)
    .map((email) => email.trim())
    .filter(Boolean);

export const sendSignupNotification = async (user: SignupUser): Promise<EmailResult> => {
  const recipients = parseRecipients(process.env.SIGNUP_NOTIFICATION_TO);

  if (recipients.length === 0) {
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'signup-notification:skipped',
        reason: 'missing-configuration',
        userId: user.id,
      }),
    );
    return { status: 'skipped', reason: 'missing-configuration' };
  }

  const fullName = `${user.firstName} ${user.lastName}`.trim() || 'Unknown';
  const createdAt = new Date().toISOString();
  const subject = `New League Night Pro signup: ${fullName}`;
  const text = [
    'A new user signed up for League Night Pro.',
    '',
    `Name: ${fullName}`,
    `Email: ${user.email}`,
    `Role: ${user.role || 'Unknown'}`,
    `User ID: ${user.id}`,
    `Signed up: ${createdAt}`,
  ].join('\n');
  const html = `
    <h2>New League Night Pro signup</h2>
    <p>A new user created an account.</p>
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
      <tr><td><strong>Name</strong></td><td>${escapeEmailHtml(fullName)}</td></tr>
      <tr><td><strong>Email</strong></td><td>${escapeEmailHtml(user.email)}</td></tr>
      <tr><td><strong>Role</strong></td><td>${escapeEmailHtml(user.role || 'Unknown')}</td></tr>
      <tr><td><strong>User ID</strong></td><td>${user.id}</td></tr>
      <tr><td><strong>Signed up</strong></td><td>${createdAt}</td></tr>
    </table>
  `.trim();

  return sendAppEmail({
    from: process.env.SIGNUP_NOTIFICATION_FROM,
    to: recipients,
    replyTo: user.email,
    subject,
    text,
    html,
    tags: [{ name: 'category', value: 'new-signup' }],
    idempotencyKey: `signup-user-${user.id}`,
  });
};
