import { escapeEmailHtml } from '../services/email';

export const SUPPORT_CATEGORIES = ['question', 'bug', 'feedback', 'billing', 'other'] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

type SupportRequester = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
};

const categoryLabels: Record<SupportCategory, string> = {
  question: 'Question',
  bug: 'Bug report',
  feedback: 'Feedback',
  billing: 'Billing',
  other: 'Other',
};

export const buildSupportMessageEmail = ({
  requester,
  category,
  subject,
  message,
}: {
  requester: SupportRequester;
  category: SupportCategory;
  subject: string;
  message: string;
}) => {
  const requesterName = `${requester.firstName} ${requester.lastName}`.trim();
  const safeMessage = escapeEmailHtml(message).replaceAll('\n', '<br />');

  return {
    subject: `[League Night Pro] ${categoryLabels[category]}: ${subject}`,
    replyTo: requester.email,
    text: [
      `${categoryLabels[category]} from ${requesterName} (${requester.email})`,
      `User ID: ${requester.id}`,
      `Role: ${requester.role}`,
      '',
      message,
    ].join('\n'),
    html: `
      <h2>${escapeEmailHtml(categoryLabels[category])}</h2>
      <p><strong>From:</strong> ${escapeEmailHtml(requesterName)} (${escapeEmailHtml(requester.email)})</p>
      <p><strong>User ID:</strong> ${requester.id}<br /><strong>Role:</strong> ${escapeEmailHtml(requester.role)}</p>
      <hr />
      <p>${safeMessage}</p>
    `,
  };
};
