import { prisma } from '../../prisma';
import { sendSeasonRenewalReminderEmail } from './seasonLifecycleEmail';
import { getLeagueBillingStatus, type LeagueEntitlementState } from './seasonEntitlement';

export const isLeagueSeasonExpired = (league: { type: string; endDate: Date }, now = new Date()) => {
  if (String(league.type).toLowerCase() !== 'season') return false;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return league.endDate < today;
};

export const getLeagueMutationBlock = (league: {
  type: string;
  endDate: Date;
  seasonStatus: string;
  entitlement?: LeagueEntitlementState | null;
}) => {
  if (getLeagueBillingStatus(league) === 'payment_due') {
    return {
      status: 402,
      code: 'LEAGUE_PAYMENT_DUE',
      message: 'This league is read-only because its season payment was refunded or disputed.',
    } as const;
  }
  if (
    league.seasonStatus === 'archived' ||
    (league.seasonStatus === 'active' && isLeagueSeasonExpired(league))
  ) {
    return {
      status: 409,
      code: 'LEAGUE_ARCHIVED',
      message: 'This past season is archived and read-only. A super administrator must reopen it before historical data can be changed.',
    } as const;
  }
  return null;
};

export const processLeagueSeasonLifecycle = async (now = new Date()) => {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const reminderLimit = new Date(today);
  reminderLimit.setUTCDate(reminderLimit.getUTCDate() + 30);

  const archived = await prisma.league.updateMany({
    where: {
      type: 'season',
      endDate: { lt: today },
      seasonStatus: 'active',
      deletedAt: null,
    },
    data: { seasonStatus: 'archived', archivedAt: now },
  });

  const reminders = await prisma.league.findMany({
    where: {
      type: 'season',
      endDate: { gte: today, lte: reminderLimit },
      seasonStatus: 'active',
      renewalReminderSentAt: null,
      renewedLeague: null,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      endDate: true,
      admin: { select: { email: true, firstName: true } },
    },
  });

  let remindersSent = 0;
  for (const league of reminders) {
    const result = await sendSeasonRenewalReminderEmail({
      leagueId: league.id,
      leagueName: league.name,
      endDate: league.endDate,
      email: league.admin.email,
      firstName: league.admin.firstName,
    });
    if (result.status === 'sent') {
      await prisma.league.update({
        where: { id: league.id },
        data: { renewalReminderSentAt: now },
      });
      remindersSent += 1;
    }
  }

  return { archived: archived.count, remindersSent };
};

export const startLeagueSeasonLifecycleScheduler = () => {
  if (process.env.NODE_ENV === 'test') return () => undefined;
  const run = () => {
    void processLeagueSeasonLifecycle().catch((error) => {
      console.error(JSON.stringify({
        level: 'error',
        event: 'league-season-lifecycle:failed',
        message: error instanceof Error ? error.message : 'Unknown lifecycle error',
      }));
    });
  };
  run();
  const interval = setInterval(run, 24 * 60 * 60 * 1000);
  interval.unref();
  return () => clearInterval(interval);
};
