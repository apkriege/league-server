import { afterEach, describe, expect, it, vi } from 'vitest';

const { sendAppEmailMock } = vi.hoisted(() => ({ sendAppEmailMock: vi.fn() }));

vi.mock('../services/email', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/email')>();
  return { ...original, sendAppEmail: sendAppEmailMock };
});

import { sendEmailVerificationEmail } from '../services/emailVerificationEmail';

describe('email verification email', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CLIENT_URL;
  });

  it('includes the one-time verification token in the client URL', async () => {
    process.env.CLIENT_URL = 'https://app.example.com';
    sendAppEmailMock.mockResolvedValue({ status: 'sent', emailId: 'email_verify_1' });

    await sendEmailVerificationEmail({
      userId: 8,
      email: 'new-admin@example.com',
      firstName: 'Ada',
      token: 'verification-token',
    });

    expect(sendAppEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['new-admin@example.com'],
        subject: 'Verify your League Night Pro email',
        text: expect.stringContaining(
          'https://app.example.com/verify-email?token=verification-token',
        ),
      }),
    );
  });
});
