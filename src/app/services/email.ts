import { CreateEmailOptions, Resend } from 'resend';

export type EmailResult =
  | { status: 'sent'; emailId: string | null }
  | { status: 'skipped'; reason: 'missing-configuration' }
  | { status: 'failed'; reason: string };

export type SendEmailInput = CreateEmailOptions & {
  idempotencyKey?: string;
};

export type SendAppEmailInput = Omit<SendEmailInput, 'from'> & {
  from?: string;
};

export const escapeEmailHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export const sendEmail = async (input: SendEmailInput): Promise<EmailResult> => {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();

  if (!apiKey) {
    return { status: 'skipped', reason: 'missing-configuration' };
  }

  try {
    const resend = new Resend(apiKey);
    const { idempotencyKey, ...message } = input;
    const { data, error } = await resend.emails.send(
      message,
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    if (error) {
      const reason = error.message || 'Resend rejected the email';
      console.error(JSON.stringify({ level: 'error', event: 'email:failed', reason }));
      return { status: 'failed', reason };
    }

    return { status: 'sent', emailId: data?.id || null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown email provider error';
    console.error(JSON.stringify({ level: 'error', event: 'email:failed', reason }));
    return { status: 'failed', reason };
  }
};

export const sendAppEmail = async (input: SendAppEmailInput): Promise<EmailResult> => {
  const from = String(
    input.from || process.env.EMAIL_FROM || process.env.SIGNUP_NOTIFICATION_FROM || '',
  ).trim();
  if (!from) {
    return { status: 'skipped', reason: 'missing-configuration' };
  }

  return sendEmail({ ...input, from } as SendEmailInput);
};
