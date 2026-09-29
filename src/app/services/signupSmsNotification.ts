type SignupUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role?: string | null;
};

export type SignupSmsResult =
  | { status: 'sent'; messageSid: string }
  | { status: 'skipped'; reason: 'missing-configuration' }
  | { status: 'failed'; reason: string };

export const sendSignupSmsNotification = async (user: SignupUser): Promise<SignupSmsResult> => {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const from = String(process.env.TWILIO_FROM_NUMBER || '').trim();
  const to = String(process.env.SIGNUP_SMS_TO || '').trim();

  if (!accountSid || !authToken || !from || !to) {
    return { status: 'skipped', reason: 'missing-configuration' };
  }

  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const body = `New League Night Pro signup: ${fullName} (${user.role || 'USER'}), ${user.email}. User #${user.id}.`;

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) {
      return { status: 'failed', reason: `Twilio rejected the message (HTTP ${response.status})` };
    }
    const data: unknown = await response.json();
    const messageSid = typeof data === 'object' && data !== null && 'sid' in data && typeof data.sid === 'string'
      ? data.sid
      : null;
    return messageSid
      ? { status: 'sent', messageSid }
      : { status: 'failed', reason: 'Twilio response did not include a message SID' };
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.name : 'Unknown SMS provider error',
    };
  }
};
