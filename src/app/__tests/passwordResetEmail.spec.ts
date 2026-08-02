import { afterEach, describe, expect, it, vi } from 'vitest';

const { sendAppEmailMock } = vi.hoisted(() => ({ sendAppEmailMock: vi.fn() }));

vi.mock('../services/email', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/email')>();
  return { ...original, sendAppEmail: sendAppEmailMock };
});

import { sendPasswordResetEmail } from '../services/passwordResetEmail';

describe('password reset email', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CLIENT_URL;
  });

  it('uses the shared email service and includes the one-time token', async () => {
    process.env.CLIENT_URL = 'https://app.example.com';
    sendAppEmailMock.mockResolvedValue({ status: 'sent', emailId: 'email_2' });

    await sendPasswordResetEmail({
      userId: 5,
      email: 'admin@example.com',
      firstName: 'Adam',
      token: 'reset-token',
    });

    expect(sendAppEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['admin@example.com'],
        text: expect.stringContaining(
          'https://app.example.com/reset-password?token=reset-token',
        ),
      }),
    );
  });
});
