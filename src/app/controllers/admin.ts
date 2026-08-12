import { Request, Response } from 'express';
import { prisma } from '../../prisma';
import { getAdminBillingDashboard } from '../services/adminBilling';

class AdminController {
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
        },
        orderBy: {
          id: 'desc',
        },
      });

      return res.json(leagues);
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
