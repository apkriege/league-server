import { prisma } from '../../prisma';
import { Prisma } from '@prisma/client';

type NotificationInput = {
  userId: number;
  leagueId?: number | null;
  type: string;
  title: string;
  body: string;
  metadata?: Prisma.InputJsonValue | null;
};

export const createNotification = async ({
  userId,
  leagueId = null,
  type,
  title,
  body,
  metadata = null,
}: NotificationInput) => {
  try {
    return await prisma.notification.create({
      data: {
        userId,
        leagueId,
        type,
        title,
        body,
        ...(metadata ? { metadata } : {}),
      },
    });
  } catch (error) {
    console.error('notification error:', error instanceof Error ? error.message : error);
    return null;
  }
};

export const notifyLeagueAdmins = async (
  leagueId: number,
  payload: Omit<NotificationInput, 'userId' | 'leagueId'>,
) => {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { adminId: true },
  });

  if (!league?.adminId) return null;

  return createNotification({
    userId: league.adminId,
    leagueId,
    ...payload,
  });
};
