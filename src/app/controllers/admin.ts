import { Request, Response } from 'express';
import { prisma } from '../../prisma';
import { getAdminBillingDashboard } from '../services/adminBilling';
import {
  createPaymentBypassCode,
  getPaymentBypassCodeStatus,
  listPaymentBypassCodes,
  revokePaymentBypassCode,
} from '../services/paymentBypassCode';
import { getLeagueRoundProgress } from '../utils/league-round-progress';
import { writeAuditLog } from '../utils/audit';
import { leagueEntitlementStateSelect } from '../services/seasonEntitlement';

class AdminController {
  static updateLeagueLifecycle = async (req: Request, res: Response) => {
    const leagueId = Number(req.params.id);
    const requestedStatus = String(req.body?.status || '').toLowerCase();
    if (!Number.isInteger(leagueId) || leagueId <= 0) {
      return res.status(400).json({ message: 'Invalid league ID.' });
    }
    if (!['archived', 'reopened'].includes(requestedStatus)) {
      return res.status(400).json({ message: 'Status must be archived or reopened.' });
    }
    const league = await prisma.league.findFirst({
      where: { id: leagueId, deletedAt: null },
      select: { id: true, name: true, seasonStatus: true },
    });
    if (!league) return res.status(404).json({ message: 'League not found.' });

    const updated = await prisma.league.update({
      where: { id: league.id },
      data: {
        seasonStatus: requestedStatus,
        archivedAt: requestedStatus === 'archived' ? new Date() : null,
      },
    });
    await writeAuditLog({
      userId: req.session.userId ?? null,
      leagueId,
      entity: 'league',
      entityId: leagueId,
      action: `lifecycle_${requestedStatus}`,
      summary: `${requestedStatus === 'archived' ? 'Archived' : 'Reopened'} ${league.name}.`,
      metadata: { previousStatus: league.seasonStatus, nextStatus: requestedStatus },
    });
    return res.json(updated);
  };

  static correctLeagueRenewalLink = async (req: Request, res: Response) => {
    const leagueId = Number(req.params.id);
    if (!Number.isInteger(leagueId) || leagueId <= 0) {
      return res.status(400).json({ message: 'Invalid league ID.' });
    }
    const league = await prisma.league.findFirst({
      where: { id: leagueId, deletedAt: null },
      select: {
        id: true,
        name: true,
        renewedFromLeagueId: true,
        entitlementId: true,
        _count: { select: { events: { where: { deletedAt: null } } } },
      },
    });
    if (!league) return res.status(404).json({ message: 'League not found.' });
    if (!league.renewedFromLeagueId) {
      return res.status(409).json({ message: 'This league is not linked as a renewal.' });
    }
    if (league._count.events > 0) {
      return res.status(409).json({
        message: 'A renewal link can only be corrected before events are created in the new season.',
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.league.update({
        where: { id: league.id },
        data: { renewedFromLeagueId: null },
      });
      if (league.entitlementId) {
        await tx.league_season_entitlement.update({
          where: { id: league.entitlementId },
          data: { renewedFromLeagueId: null },
        });
      }
    });
    await writeAuditLog({
      userId: req.session.userId ?? null,
      leagueId,
      entity: 'league',
      entityId: leagueId,
      action: 'correct_renewal_link',
      summary: `Removed the incorrect previous-season link from ${league.name}.`,
      metadata: { previousLeagueId: league.renewedFromLeagueId },
    });
    return res.json({ message: 'The renewal link was removed. Both leagues and their billing records were preserved.' });
  };

  static getPaymentBypassCodes = async (_req: Request, res: Response) => {
    try {
      const codes = await listPaymentBypassCodes();
      return res.json(
        codes.map(({ codeHash: _codeHash, ...code }) => ({
          ...code,
          status: getPaymentBypassCodeStatus(code),
        })),
      );
    } catch (error) {
      console.error('getPaymentBypassCodes error:', error);
      return res.status(500).json({ message: 'Failed to load payment access codes' });
    }
  };

  static createPaymentBypassCode = async (req: Request, res: Response) => {
    try {
      const createdById = req.session.userId;
      if (!createdById) return res.status(401).json({ message: 'Not authenticated' });
      const { code, record } = await createPaymentBypassCode(createdById, req.body || {});
      const { codeHash: _codeHash, ...safeRecord } = record;
      return res.status(201).json({
        code,
        record: { ...safeRecord, status: 'active' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create payment access code';
      const status = message.includes('must be') ? 400 : 500;
      return res.status(status).json({ message });
    }
  };

  static revokePaymentBypassCode = async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid payment access code ID' });
    }
    try {
      const revoked = await revokePaymentBypassCode(id);
      if (!revoked) {
        return res.status(409).json({ message: 'Only an active unused code can be revoked.' });
      }
      return res.status(204).send();
    } catch (error) {
      console.error('revokePaymentBypassCode error:', error);
      return res.status(500).json({ message: 'Failed to revoke payment access code' });
    }
  };

  static getBilling = async (_req: Request, res: Response) => {
    try {
      return res.json(await getAdminBillingDashboard());
    } catch (error) {
      console.error('getAdminBilling error:', error);
      return res.status(500).json({ message: 'Failed to load billing data' });
    }
  };

  static getLeagues = async (req: Request, res: Response) => {
    try {
      const { user } = req as any; // Assuming you have user info in the request object
      const role = String(user?.role || '').toUpperCase();
      const isSuperAdmin = role === 'SUPER';

      const leagues = await prisma.league.findMany({
        where: isSuperAdmin
          ? { deletedAt: null }
          : {
              adminId: user.id, // Filter leagues by the admin's user ID
              deletedAt: null,
            },
        include: {
          entitlement: { select: leagueEntitlementStateSelect },
          _count: {
            select: {
              players: { where: { deletedAt: null } },
              events: { where: { deletedAt: null } },
            },
          },
          events: {
            where: { deletedAt: null },
            select: { status: true, type: true },
          },
          renewedFromLeague: {
            select: { id: true, name: true, startDate: true, endDate: true },
          },
          renewedLeague: {
            select: { id: true, name: true, startDate: true, endDate: true },
          },
        },
        orderBy: {
          id: 'desc',
        },
      });

      return res.json(
        leagues.map(({ events, ...league }) => ({
          ...league,
          ...getLeagueRoundProgress(events),
        })),
      );
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getLeague = async (req: Request, res: Response) => {
    try {
      const { user } = req as any;
      const role = String(user?.role || '').toUpperCase();
      const isSuperAdmin = role === 'SUPER';
      const leagueId = Number(req.params.id);

      const league = await prisma.league.findFirst({
        where: {
          id: leagueId,
          deletedAt: null,
          ...(isSuperAdmin ? {} : { adminId: user.id }), // Ensure the league belongs to the admin
        },
        include: {
          entitlement: { select: leagueEntitlementStateSelect },
          events: { where: { deletedAt: null } },
          players: { where: { deletedAt: null } },
          teams: {
            where: { deletedAt: null },
            include: {
              players: { where: { deletedAt: null } },
            },
          },
          renewedFromLeague: {
            select: { id: true, name: true, startDate: true, endDate: true },
          },
          renewedLeague: {
            select: { id: true, name: true, startDate: true, endDate: true },
          },
        },
      });

      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      return res.json(league);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export default AdminController;
