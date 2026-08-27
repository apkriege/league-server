import { describe, expect, it } from 'vitest';
import { buildSupportMessageEmail } from '../emailTemplates/supportMessage';

describe('buildSupportMessageEmail', () => {
  it('includes requester context and safely escapes user content', () => {
    const email = buildSupportMessageEmail({
      requester: {
        id: 7,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        role: 'USER',
      },
      category: 'bug',
      subject: 'Scores issue',
      message: '<script>alert(1)</script>\nSecond line',
    });

    expect(email.replyTo).toBe('ada@example.com');
    expect(email.subject).toContain('Bug report: Scores issue');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;<br />Second line');
  });
});
