import { Request, Response } from 'express';
import { prisma } from '../../prisma';
import {
  buildSupportMessageEmail,
  SUPPORT_CATEGORIES,
  type SupportCategory,
} from '../emailTemplates/supportMessage';
import { sendAppEmail } from '../services/email';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class SupportController {
  static submitMessage = async (req: Request, res: Response) => {
    const requester = req.user as
      | {
          id: number;
          firstName: string;
          lastName: string;
          email: string;
          role: string;
        }
      | undefined;

    if (!requester?.id || !EMAIL_PATTERN.test(String(requester.email || ''))) {
      return res.status(401).json({ message: 'A signed-in account with an email is required.' });
    }

    const category = String(req.body?.category || '').trim().toLowerCase();
    const subject = String(req.body?.subject || '').trim();
    const message = String(req.body?.message || '').trim();

    if (!SUPPORT_CATEGORIES.includes(category as SupportCategory)) {
      return res.status(400).json({ message: 'Select a valid message category.' });
    }
    if (subject.length < 3 || subject.length > 120) {
      return res.status(400).json({ message: 'Subject must be between 3 and 120 characters.' });
    }
    if (message.length < 10 || message.length > 4000) {
      return res.status(400).json({ message: 'Message must be between 10 and 4,000 characters.' });
    }

    let supportMessage: { id: number } | null = null;

    try {
      supportMessage = await prisma.support_message.create({
        data: {
          requesterId: requester.id,
          category,
          subject,
          message,
        },
        select: { id: true },
      });

      const configuredRecipient = String(
        process.env.SUPPORT_EMAIL || process.env.SIGNUP_NOTIFICATION_TO || '',
      ).trim();
      const recipients = EMAIL_PATTERN.test(configuredRecipient)
        ? [configuredRecipient]
        : (
            await prisma.user.findMany({
              where: { role: { equals: 'SUPER', mode: 'insensitive' }, deletedAt: null },
              select: { email: true },
            })
          )
            .map((user) => user.email.trim())
            .filter((email) => EMAIL_PATTERN.test(email));

      if (recipients.length === 0) {
        await prisma.support_message.update({
          where: { id: supportMessage.id },
          data: { emailStatus: 'skipped', failureReason: 'No support recipient configured.' },
        });
        return res.status(503).json({ message: 'Support email is not configured yet.' });
      }

      const result = await sendAppEmail({
        ...buildSupportMessageEmail({
          requester,
          category: category as SupportCategory,
          subject,
          message,
        }),
        to: recipients,
        from: process.env.SUPPORT_EMAIL_FROM,
      });

      if (result.status === 'skipped') {
        await prisma.support_message.update({
          where: { id: supportMessage.id },
          data: { emailStatus: 'skipped', failureReason: 'Email sender is not configured.' },
        });
        return res.status(503).json({ message: 'Support email is not configured yet.' });
      }
      if (result.status === 'failed') {
        await prisma.support_message.update({
          where: { id: supportMessage.id },
          data: { emailStatus: 'failed', failureReason: result.reason.slice(0, 500) },
        });
        console.error(`Support message email failed: ${result.reason}`);
        return res.status(502).json({ message: 'Unable to send your message right now.' });
      }

      await prisma.support_message.update({
        where: { id: supportMessage.id },
        data: { emailStatus: 'sent', emailId: result.emailId },
      });

      return res.status(200).json({
        message: 'Your message was sent to support.',
        requestId: supportMessage.id,
      });
    } catch (error) {
      if (supportMessage) {
        await prisma.support_message
          .update({
            where: { id: supportMessage.id },
            data: {
              emailStatus: 'failed',
              failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
            },
          })
          .catch(() => undefined);
      }
      console.error('Support message failed:', error);
      return res.status(500).json({ message: 'Unable to send your message right now.' });
    }
  };
}

export default SupportController;
