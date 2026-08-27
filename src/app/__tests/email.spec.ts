import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendAppEmail, sendEmail } from '../services/email';

const { resendSendMock } = vi.hoisted(() => ({
  resendSendMock: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSendMock };
  },
}));

const message = {
  from: 'League Night <notifications@example.com>',
  to: ['owner@example.com'],
  replyTo: 'player@example.com',
  subject: 'Test email',
  text: 'Test',
  idempotencyKey: 'test-email-1',
};

describe('sendEmail', () => {
  beforeEach(() => {
    resendSendMock.mockReset();
    process.env.RESEND_API_KEY = 're_test';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.SIGNUP_NOTIFICATION_FROM;
  });

  it('skips sending without a Resend API key', async () => {
    delete process.env.RESEND_API_KEY;

    await expect(sendEmail(message)).resolves.toEqual({
      status: 'skipped',
      reason: 'missing-configuration',
    });
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('sends through Resend with the provided options', async () => {
    resendSendMock.mockResolvedValue({
      data: { id: 'email_123' },
      error: null,
    });

    await expect(sendEmail(message)).resolves.toEqual({
      status: 'sent',
      emailId: 'email_123',
    });
    expect(resendSendMock).toHaveBeenCalledWith(
      {
        from: message.from,
        to: message.to,
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
      },
      { idempotencyKey: message.idempotencyKey },
    );
  });

  it('returns provider errors without throwing', async () => {
    resendSendMock.mockResolvedValue({
      data: null,
      error: { message: 'Invalid sender' },
    });

    await expect(sendEmail(message)).resolves.toEqual({
      status: 'failed',
      reason: 'Invalid sender',
    });
  });

  it('applies the shared sender configuration to app emails', async () => {
    process.env.EMAIL_FROM = 'League Night <notifications@example.com>';
    resendSendMock.mockResolvedValue({
      data: { id: 'email_456' },
      error: null,
    });

    await expect(
      sendAppEmail({
        to: ['owner@example.com'],
        subject: 'Configured email',
        text: 'Test',
      }),
    ).resolves.toEqual({
      status: 'sent',
      emailId: 'email_456',
    });
    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'League Night <notifications@example.com>',
        to: ['owner@example.com'],
      }),
      undefined,
    );
  });

  it('skips app emails without a shared sender', async () => {
    await expect(
      sendAppEmail({
        to: ['owner@example.com'],
        subject: 'Missing sender',
        text: 'Test',
      }),
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'missing-configuration',
    });
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});
