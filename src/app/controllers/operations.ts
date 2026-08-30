import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../../prisma';
import { writeAuditLog } from '../utils/audit';
import { sendLeagueInvitationEmail } from '../services/leagueInvitationEmail';
import { getLeagueMutationBlock } from '../services/leagueLifecycle';

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

const normalizeEmail = (email: unknown) => String(email || '').trim().toLowerCase();
const createInviteToken = () => crypto.randomBytes(24).toString('hex');

class OperationsController {
  static getLeagueAnnouncements = async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);

    const announcements = await (prisma as any).league_announcement.findMany({
      where: {
        leagueId,
        deletedAt: null,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(announcements);
  };

  static createLeagueAnnouncement = async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const userId = Number(req.session.userId);
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();

    if (!title || !body) {
      return res.status(400).json({ message: 'Title and body are required.' });
    }

    const league = await prisma.league.findFirst({
      where: { id: leagueId, deletedAt: null },
      select: { id: true, name: true, adminId: true },
    });

    if (!league) {
      return res.status(404).json({ message: 'League not found' });
    }

    const announcement = await (prisma as any).league_announcement.create({
      data: {
        leagueId,
        authorUserId: userId,
        title,
        body,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    await writeAuditLog({
      userId,
      leagueId,
      entity: 'league_announcement',
      entityId: announcement.id,
      action: 'create',
      summary: `Posted league announcement "${title}".`,
      metadata: { title },
    });

    res.status(201).json(announcement);
  };

  static updateLeagueAnnouncement = async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const announcementId = Number(req.params.announcementId);
    const userId = Number(req.session.userId);
    const title = req.body?.title !== undefined ? String(req.body.title || '').trim() : undefined;
    const body = req.body?.body !== undefined ? String(req.body.body || '').trim() : undefined;

    if (title !== undefined && !title) {
      return res.status(400).json({ message: 'Title is required.' });
    }
    if (body !== undefined && !body) {
      return res.status(400).json({ message: 'Body is required.' });
    }

    const existing = await (prisma as any).league_announcement.findFirst({
      where: { id: announcementId, leagueId, deletedAt: null },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    const announcement = await (prisma as any).league_announcement.update({
      where: { id: announcementId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(body !== undefined ? { body } : {}),
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    await writeAuditLog({
      userId,
      leagueId,
      entity: 'league_announcement',
      entityId: announcementId,
      action: 'update',
      summary: `Updated league announcement "${announcement.title}".`,
      metadata: { title: announcement.title },
    });

    res.status(200).json(announcement);
  };

  static deleteLeagueAnnouncement = async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const announcementId = Number(req.params.announcementId);
    const userId = Number(req.session.userId);

    const existing = await (prisma as any).league_announcement.findFirst({
      where: { id: announcementId, leagueId, deletedAt: null },
      select: { id: true, title: true },
    });

    if (!existing) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    await (prisma as any).league_announcement.update({
      where: { id: announcementId },
      data: { deletedAt: new Date() },
    });

    await writeAuditLog({
      userId,
      leagueId,
      entity: 'league_announcement',
      entityId: announcementId,
      action: 'delete',
      summary: `Removed league announcement "${existing.title}".`,
      metadata: { title: existing.title },
    });

    res.status(200).json({ message: 'Announcement removed for all league members.' });
  };

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
    ].filter((target) => target.email);

    if (inviteTargets.length === 0) {
      return res.status(400).json({ message: 'Select at least one roster player with an email address.' });
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

    const delivery = await Promise.all(
      created.map(async (invite) => ({
        invitationId: invite.id,
        email: invite.email,
        result: await sendLeagueInvitationEmail({
          invitationId: invite.id,
          token: invite.token,
          email: invite.email,
          playerName:
            inviteTargets.find((target) => target.email === invite.email)?.name || invite.email,
          leagueName: league.name,
        }),
      })),
    );

    res.status(201).json({ invitations: created, delivery });
  };

  static revokeLeagueInvitation = async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const invitationId = Number(req.params.invitationId);
    const userId = Number(req.session.userId);

    const existing = await prisma.league_invitation.findFirst({
      where: { id: invitationId, leagueId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

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
        league: {
          select: {
            id: true,
            name: true,
            type: true,
            endDate: true,
            seasonStatus: true,
            entitlement: true,
          },
        },
        player: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!invitation || invitation.deletedAt || invitation.status !== 'pending') {
      return res.status(404).json({ message: 'Invitation not found' });
    }
    const invitationBlock = getLeagueMutationBlock(invitation.league);
    if (invitationBlock) {
      return res.status(invitationBlock.status).json({
        code: invitationBlock.code,
        message: 'This invitation belongs to a read-only past season and can no longer be claimed.',
      });
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

    const invitation = await prisma.league_invitation.findFirst({
      where: { token, deletedAt: null, status: 'pending', league: { deletedAt: null } },
      include: {
        league: {
          select: {
            id: true,
            name: true,
            adminId: true,
            type: true,
            endDate: true,
            seasonStatus: true,
            entitlement: true,
          },
        },
        player: true,
      },
    });

    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }
    const claimBlock = getLeagueMutationBlock(invitation.league);
    if (claimBlock) {
      return res.status(claimBlock.status).json({
        code: claimBlock.code,
        message: 'This invitation belongs to a read-only past season and can no longer be claimed.',
      });
    }

    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      await prisma.league_invitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      return res.status(410).json({ message: 'Invitation expired' });
    }

    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
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
    if (!player || player.deletedAt) {
      player = await prisma.player.findFirst({
        where: { leagueId: invitation.leagueId, email: normalizedUserEmail, deletedAt: null },
      });
    }

    if (!player) {
      return res.status(409).json({
        message: 'The roster player for this invitation is no longer available.',
      });
    }
    if (player.userId && player.userId !== userId) {
      return res.status(409).json({
        message: 'This roster player is already connected to another account.',
      });
    }

    const claimed = await prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { id: player.id },
        data: { userId },
      });
      return tx.league_invitation.update({
        where: { id: invitation.id },
        data: {
          status: 'claimed',
          claimedById: userId,
          claimedAt: new Date(),
        },
      });
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
          events: { where: { deletedAt: null }, select: { id: true, status: true } },
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

}

export default OperationsController;
