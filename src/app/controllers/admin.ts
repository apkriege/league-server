import { Request, Response } from 'express';
import { prisma } from '../../prisma';

class AdminController {
  static getLeagues = async (req: Request, res: Response) => {
    try {
      const { user } = req as any; // Assuming you have user info in the request object

      const leagues = await prisma.league.findMany({
        where: {
          adminId: user.id, // Filter leagues by the admin's user ID
        },
        include: {
          _count: {
            select: {
              players: true,
              events: true,
            },
          },
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
      console.log('Admin user:', user);
      const leagueId = Number(req.params.id);

      const league = await prisma.league.findFirst({
        where: {
          id: leagueId,
          adminId: user.id, // Ensure the league belongs to the admin
        },
        include: {
          events: true,
          players: true,
          teams: {
            include: {
              players: true,
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
