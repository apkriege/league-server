import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendSignupNotification } from '../services/signupNotification';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock('../services/email', () => ({
  sendAppEmail: sendMock,
  escapeEmailHtml: (value: string) => value,
}));

const user = {
  id: 42,
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  role: 'ADMIN',
};

describe('sendSignupNotification', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ status: 'sent', emailId: 'email_123' });
    process.env.RESEND_API_KEY = 're_test';
    process.env.SIGNUP_NOTIFICATION_FROM = 'League Night <notifications@example.com>';
    process.env.SIGNUP_NOTIFICATION_TO = 'owner@example.com';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.SIGNUP_NOTIFICATION_FROM;
    delete process.env.SIGNUP_NOTIFICATION_TO;
  });

  it('skips sending when notification configuration is incomplete', async () => {
    sendMock.mockResolvedValue({
      status: 'skipped',
      reason: 'missing-configuration',
    });

    await expect(sendSignupNotification(user)).resolves.toEqual({
      status: 'skipped',
      reason: 'missing-configuration',
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('sends the signup details with a stable idempotency key', async () => {
    await expect(sendSignupNotification(user)).resolves.toEqual({
      status: 'sent',
      emailId: 'email_123',
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'League Night <notifications@example.com>',
        to: ['owner@example.com'],
        replyTo: 'ada@example.com',
        subject: 'New League Night Pro signup: Ada Lovelace',
        idempotencyKey: 'signup-user-42',
      }),
    );
  });

  it('returns a failure without throwing when the provider rejects the request', async () => {
    sendMock.mockResolvedValue({
      status: 'failed',
      reason: 'Invalid sender',
    });

    await expect(sendSignupNotification(user)).resolves.toEqual({
      status: 'failed',
      reason: 'Invalid sender',
    });
  });
});
