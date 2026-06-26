import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../../prisma';
import { writeAuditLog } from '../utils/audit';
import { createNotification } from '../utils/notifications';

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

const normalizeEmail = (email: unknown) => String(email || '').trim().toLowerCase();
const createInviteToken = () => crypto.randomBytes(24).toString('hex');

class OperationsController {
  static getLeagueInvitations = async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);

    const invitations = await prisma.league_invitation.findMany({
      where: { leagueId, deletedAt: null },
      include: {
        player: { select: { id: true, firstName: true, lastName: true, email: true } },
        claimedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(invitations);
  };

  static createLeagueInvitations = async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const userId = Number(req.session.userId);
    const playerIds = Array.isArray(req.body?.playerIds)
      ? req.body.playerIds.map((id: unknown) => Number(id)).filter(Boolean)
      : [];
    const emails = Array.isArray(req.body?.emails)
      ? req.body.emails.map((email: unknown) => normalizeEmail(email)).filter(Boolean)
      : [];

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, name: true },
    });

    if (!league) {
      return res.status(404).json({ message: 'League not found' });
    }

    const players =
      playerIds.length > 0
        ? await prisma.player.findMany({
            where: { id: { in: playerIds }, leagueId, deletedAt: null },
            select: { id: true, email: true, firstName: true, lastName: true },
          })
        : [];

    const inviteTargets = [
      ...players.map((player) => ({
        playerId: player.id,
        email: normalizeEmail(player.email),
        name: `${player.firstName} ${player.lastName}`.trim(),
      })),
      ...emails.map((email: string) => ({ playerId: null, email, name: email })),
    ].filter((target) => target.email);

    if (inviteTargets.length === 0) {
      return res.status(400).json({ message: 'Select players or enter emails to invite.' });
    }

    const created = [];

    for (const target of inviteTargets) {
      const existing = await prisma.league_invitation.findFirst({
        where: {
          leagueId,
          email: target.email,
          status: 'pending',
          deletedAt: null,
        },
      });

      if (existing) {
        created.push(existing);
        continue;
      }

      const invite = await prisma.league_invitation.create({
        data: {
          leagueId,
          playerId: target.playerId,
          email: target.email,
          token: createInviteToken(),
          invitedById: userId,
          expiresAt: addDays(30),
        },
      });

      created.push(invite);
    }

    await writeAuditLog({
      userId,
      leagueId,
      entity: 'league_invitation',
      action: 'create',
      summary: `Created ${created.length} league invitation${created.length === 1 ? '' : 's'}.`,
      metadata: { invitationIds: created.map((invite) => invite.id) },
    });

    res.status(201).json(created);
  };

  static revokeLeagueInvitation = async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const invitationId = Number(req.params.invitationId);
    const userId = Number(req.session.userId);

    const invitation = await prisma.league_invitation.update({
      where: { id: invitationId },
      data: { status: 'revoked', deletedAt: new Date() },
    });

    await writeAuditLog({
      userId,
      leagueId,
      entity: 'league_invitation',
      entityId: invitationId,
      action: 'revoke',
      summary: `Revoked invitation for ${invitation.email}.`,
    });

    res.status(200).json(invitation);
  };

  static getInvitationByToken = async (req: Request, res: Response) => {
    const invitation = await prisma.league_invitation.findUnique({
      where: { token: String(req.params.token || '') },
      include: {
        league: { select: { id: true, name: true } },
        player: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!invitation || invitation.deletedAt || invitation.status !== 'pending') {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      await prisma.league_invitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      return res.status(410).json({ message: 'Invitation expired' });
    }

    res.status(200).json(invitation);
  };

  static claimInvitation = async (req: Request, res: Response) => {
    const userId = Number(req.session.userId);
    const token = String(req.params.token || '');

    const invitation = await prisma.league_invitation.findUnique({
      where: { token },
      include: { league: { select: { id: true, name: true, adminId: true } }, player: true },
    });

    if (!invitation || invitation.deletedAt || invitation.status !== 'pending') {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      await prisma.league_invitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      return res.status(410).json({ message: 'Invitation expired' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const normalizedUserEmail = normalizeEmail(user.email);
    if (normalizeEmail(invitation.email) !== normalizedUserEmail) {
      return res.status(403).json({
        message: `This invitation is for ${invitation.email}. Sign in with that email to claim it.`,
      });
    }

    let player = invitation.player;
    if (!player) {
      player = await prisma.player.findFirst({
        where: { leagueId: invitation.leagueId, email: normalizedUserEmail, deletedAt: null },
      });
    }

    if (player) {
      await prisma.player.update({
        where: { id: player.id },
        data: { userId },
      });
    }

    const claimed = await prisma.league_invitation.update({
      where: { id: invitation.id },
      data: {
        status: 'claimed',
        claimedById: userId,
        claimedAt: new Date(),
      },
    });

    await createNotification({
      userId: invitation.league.adminId,
      leagueId: invitation.leagueId,
      type: 'invitation_claimed',
      title: 'Player claimed invitation',
      body: `${user.firstName} ${user.lastName} joined ${invitation.league.name}.`,
      metadata: { invitationId: invitation.id, playerId: player?.id ?? null },
    });

    await writeAuditLog({
      userId,
      leagueId: invitation.leagueId,
      entity: 'league_invitation',
      entityId: invitation.id,
      action: 'claim',
      summary: `${user.email} claimed an invitation to ${invitation.league.name}.`,
      metadata: { playerId: player?.id ?? null },
    });

    res.status(200).json({ invitation: claimed, leagueId: invitation.leagueId, playerId: player?.id });
  };

  static getLeagueOnboarding = async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const [league, onboarding] = await Promise.all([
      prisma.league.findUnique({
        where: { id: leagueId },
        include: {
          players: { where: { deletedAt: null }, select: { id: true } },
          teams: { where: { deletedAt: null }, select: { id: true } },
          events: { where: { deletedAt: null, isDeleted: false }, select: { id: true, status: true } },
        },
      }),
      prisma.league_onboarding.upsert({
        where: { leagueId },
        create: { leagueId },
        update: {},
      }),
    ]);

    if (!league) return res.status(404).json({ message: 'League not found' });

    const steps = [
      {
        key: 'players',
        label: 'Review players',
        complete: Boolean(onboarding.playersReviewedAt) || league.players.length > 0,
      },
      {
        key: 'teams',
        label: league.format === 'team' ? 'Review teams' : 'Team setup optional',
        complete:
          league.format !== 'team' || Boolean(onboarding.teamsReviewedAt) || league.teams.length > 0,
      },
      {
        key: 'firstEvent',
        label: 'Create first event',
        complete: Boolean(onboarding.firstEventCreatedAt) || league.events.length > 0,
      },
      {
        key: 'scorecards',
        label: 'Print scorecards',
        complete: Boolean(onboarding.scorecardsPrintedAt),
      },
      {
        key: 'scores',
        label: 'Enter first scores',
        complete:
          Boolean(onboarding.firstScoresEnteredAt) ||
          league.events.some((event) => event.status === 'completed'),
      },
    ];

    res.status(200).json({ onboarding, steps, complete: steps.every((step) => step.complete) });
  };

  static updateLeagueOnboarding = async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const userId = Number(req.session.userId);
    const key = String(req.body?.key || '');
    const now = new Date();
    const dataByKey: Record<string, Record<string, unknown>> = {
      players: { playersReviewedAt: now },
      teams: { teamsReviewedAt: now },
      firstEvent: { firstEventCreatedAt: now },
      scorecards: { scorecardsPrintedAt: now },
      scores: { firstScoresEnteredAt: now },
      dismissed: { dismissed: Boolean(req.body?.dismissed ?? true) },
    };

    const data = dataByKey[key];
    if (!data) return res.status(400).json({ message: 'Invalid onboarding key' });

    const onboarding = await prisma.league_onboarding.upsert({
      where: { leagueId },
      create: { leagueId, ...data },
      update: data,
    });

    await writeAuditLog({
      userId,
      leagueId,
      entity: 'league_onboarding',
      entityId: onboarding.id,
      action: 'update',
      summary: `Updated onboarding step: ${key}.`,
    });

    res.status(200).json(onboarding);
  };

  static getLeagueAuditLogs = async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const logs = await prisma.audit_log.findMany({
      where: { leagueId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.status(200).json(logs);
  };

  static createLeagueNotification = async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const userId = Number(req.session.userId);
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    const includeAdmin = Boolean(req.body?.includeAdmin ?? true);

    if (!title || !body) {
      return res.status(400).json({ message: 'Title and body are required.' });
    }

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, name: true, adminId: true },
    });

    if (!league) {
      return res.status(404).json({ message: 'League not found' });
    }

    const players = await prisma.player.findMany({
      where: { leagueId, deletedAt: null, userId: { not: null } },
      select: { userId: true },
    });

    const recipientIds = new Set<number>();
    players.forEach((player) => {
      if (player.userId) recipientIds.add(player.userId);
    });
    if (includeAdmin) recipientIds.add(league.adminId);

    if (recipientIds.size === 0) {
      return res.status(400).json({
        message: 'No claimed league users found. Invite players before sending notifications.',
      });
    }

    await prisma.notification.createMany({
      data: [...recipientIds].map((recipientId) => ({
        userId: recipientId,
        leagueId,
        type: 'league_announcement',
        title,
        body,
        metadata: {
          leagueId,
          sentByUserId: userId,
        },
      })),
    });

    await writeAuditLog({
      userId,
      leagueId,
      entity: 'notification',
      action: 'create',
      summary: `Sent league notification "${title}" to ${recipientIds.size} user${recipientIds.size === 1 ? '' : 's'}.`,
      metadata: { title, recipientCount: recipientIds.size },
    });

    res.status(201).json({ message: 'Notification sent.', recipientCount: recipientIds.size });
  };

  static getNotifications = async (req: Request, res: Response) => {
    const userId = Number(req.session.userId);
    const notifications = await prisma.notification.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    res.status(200).json(notifications);
  };

  static markNotificationRead = async (req: Request, res: Response) => {
    const userId = Number(req.session.userId);
    const id = Number(req.params.id);
    const notification = await prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });

    res.status(200).json(notification);
  };

  static clearNotification = async (req: Request, res: Response) => {
    const userId = Number(req.session.userId);
    const id = Number(req.params.id);
    const notification = await prisma.notification.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    res.status(200).json(notification);
  };
}

export default OperationsController;
