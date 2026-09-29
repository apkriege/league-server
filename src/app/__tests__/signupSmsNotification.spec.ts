import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendSignupSmsNotification } from '../services/signupSmsNotification';

const user = {
  id: 42,
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  role: 'USER',
};

describe('sendSignupSmsNotification', () => {
  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = `AC${'a'.repeat(32)}`;
    process.env.TWILIO_AUTH_TOKEN = 'b'.repeat(32);
    process.env.TWILIO_FROM_NUMBER = '+15557654321';
    process.env.SIGNUP_SMS_TO = '+15551234567';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    delete process.env.SIGNUP_SMS_TO;
  });

  it('sends one SMS with the verified signup details', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ sid: `SM${'c'.repeat(32)}` }),
    } as Response);

    await expect(sendSignupSmsNotification(user)).resolves.toEqual({
      status: 'sent',
      messageSid: `SM${'c'.repeat(32)}`,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/AC${'a'.repeat(32)}/Messages.json`);
    expect(options?.method).toBe('POST');
    const form = options?.body as URLSearchParams;
    expect(form.get('To')).toBe('+15551234567');
    expect(form.get('From')).toBe('+15557654321');
    expect(form.get('Body')).toContain('Ada Lovelace (USER), ada@example.com. User #42.');
  });

  it('does not call Twilio without complete configuration', async () => {
    delete process.env.SIGNUP_SMS_TO;
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(sendSignupSmsNotification(user)).resolves.toEqual({
      status: 'skipped', reason: 'missing-configuration',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports provider failures without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 400 } as Response);
    await expect(sendSignupSmsNotification(user)).resolves.toEqual({
      status: 'failed', reason: 'Twilio rejected the message (HTTP 400)',
    });
  });
});
