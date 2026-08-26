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

class AdminController {
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
          _count: {
            select: {
              players: { where: { deletedAt: null } },
              events: { where: { deletedAt: null, isDeleted: false } },
            },
          },
          events: {
            where: { deletedAt: null, isDeleted: false },
            select: { status: true, type: true, isComplete: true },
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
          events: { where: { deletedAt: null, isDeleted: false } },
          players: { where: { deletedAt: null } },
          teams: {
            where: { deletedAt: null },
            include: {
              players: { where: { deletedAt: null } },
            },
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
