import { Request, Response, NextFunction } from 'express';
import UserService from '../models/user';
import { prisma } from '../../prisma';

const getSessionUser = async (req: Request) => {
  const userId = req.session.userId;
  if (!userId) return null;
  return UserService.findById(userId);
};

const requireSessionUser = async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.sendStatus(401);
    return null;
  }

  req.user = user;
  return user;
};

export const adminGuard = (req: Request, res: Response, next: NextFunction): any => {
  getSessionUser(req)
    .then((user) => {
      if (!user) {
        return res.sendStatus(401);
      }

      const role = String(user.role).toUpperCase();
      if (role !== 'ADMIN' && role !== 'SUPER') {
        return res.sendStatus(403);
      }

      req.user = user;
      next();
    })
    .catch((error) => {
      console.error('Session auth error:', error);
      return res.sendStatus(500);
    });
};

export const userGuard = (req: Request, res: Response, next: NextFunction): any => {
  getSessionUser(req)
    .then((user) => {
      if (!user) {
        return res.sendStatus(401);
      }

      req.user = user;
      next();
    })
    .catch((error) => {
      console.error('Session auth error:', error);
      return res.sendStatus(500);
    });
};

export const superAdminGuard = (req: Request, res: Response, next: NextFunction): any => {
  getSessionUser(req)
    .then((user) => {
      if (!user) {
        return res.sendStatus(401);
      }

      if (String(user.role).toUpperCase() !== 'SUPER') {
        return res.sendStatus(403);
      }

      req.user = user;
      next();
    })
    .catch((error) => {
      console.error('Session auth error:', error);
      return res.sendStatus(500);
    });
};

export const userSelfOrAdminGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const requestedUserId = Number(req.params.id);
    const role = String(user.role).toUpperCase();
    if (role === 'ADMIN' || role === 'SUPER' || user.id === requestedUserId) {
      return next();
    }

    return res.sendStatus(403);
  } catch (error) {
    console.error('Session auth error:', error);
    return res.sendStatus(500);
  }
};

export const leagueAdminGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const role = String(user.role).toUpperCase();
    const leagueId = Number(req.params.leagueId ?? req.params.id);
    if (!Number.isInteger(leagueId) || leagueId <= 0) {
      return res.status(400).json({ message: 'Invalid league id' });
    }

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { adminId: true },
    });

    if (!league) {
      return res.status(404).json({ message: 'League not found' });
    }

    if (role === 'SUPER' || league.adminId === user.id) {
      return next();
    }

    return res.sendStatus(403);
  } catch (error) {
    console.error('League auth error:', error);
    return res.sendStatus(500);
  }
};

export const leagueMemberGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const role = String(user.role).toUpperCase();
    const leagueId = Number(req.params.leagueId ?? req.params.id);
    if (!Number.isInteger(leagueId) || leagueId <= 0) {
      return res.status(400).json({ message: 'Invalid league id' });
    }

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { adminId: true },
    });

    if (!league) {
      return res.status(404).json({ message: 'League not found' });
    }

    if (role === 'SUPER' || league.adminId === user.id) {
      req.user = user;
      return next();
    }

    const membership = await prisma.player.findFirst({
      where: { leagueId, userId: user.id, deletedAt: null },
      select: { id: true },
    });

    if (!membership) {
      return res.sendStatus(403);
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error('League member auth error:', error);
    return res.sendStatus(500);
  }
};

export const eventAdminGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const role = String(user.role).toUpperCase();
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ message: 'Invalid event id' });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { league: { select: { adminId: true } } },
    });

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (role === 'SUPER' || event.league.adminId === user.id) {
      return next();
    }

    return res.sendStatus(403);
  } catch (error) {
    console.error('Event auth error:', error);
    return res.sendStatus(500);
  }
};

export const teamMemberGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const role = String(user.role).toUpperCase();
    const teamId = Number(req.params.id);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      return res.status(400).json({ message: 'Invalid team id' });
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { leagueId: true, league: { select: { adminId: true } } },
    });

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (role === 'SUPER' || team.league?.adminId === user.id) {
      req.user = user;
      return next();
    }

    const membership = await prisma.player.findFirst({
      where: { leagueId: Number(team.leagueId), userId: user.id, deletedAt: null },
      select: { id: true },
    });

    if (!membership) {
      return res.sendStatus(403);
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error('Team member auth error:', error);
    return res.sendStatus(500);
  }
};

export const playerMemberGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const role = String(user.role).toUpperCase();
    const playerId = Number(req.params.id ?? req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      return res.status(400).json({ message: 'Invalid player id' });
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { userId: true, leagueId: true, league: { select: { adminId: true } } },
    });

    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    if (
      role === 'SUPER' ||
      player.league?.adminId === user.id ||
      Number(player.userId || 0) === Number(user.id)
    ) {
      req.user = user;
      return next();
    }

    const membership = await prisma.player.findFirst({
      where: { leagueId: Number(player.leagueId), userId: user.id, deletedAt: null },
      select: { id: true },
    });

    if (!membership) {
      return res.sendStatus(403);
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error('Player member auth error:', error);
    return res.sendStatus(500);
  }
};

export const playerAdminGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const role = String(user.role).toUpperCase();
    const playerId = Number(req.params.id ?? req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      return res.status(400).json({ message: 'Invalid player id' });
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { league: { select: { adminId: true } } },
    });

    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    if (role === 'SUPER' || player.league?.adminId === user.id) {
      return next();
    }

    return res.sendStatus(403);
  } catch (error) {
    console.error('Player auth error:', error);
    return res.sendStatus(500);
  }
};

export const teamAdminGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const role = String(user.role).toUpperCase();
    const teamId = Number(req.params.id);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      return res.status(400).json({ message: 'Invalid team id' });
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { league: { select: { adminId: true } } },
    });

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (role === 'SUPER' || team.league?.adminId === user.id) {
      return next();
    }

    return res.sendStatus(403);
  } catch (error) {
    console.error('Team auth error:', error);
    return res.sendStatus(500);
  }
};

export const flightAdminGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await requireSessionUser(req, res);
    if (!user) return;

    const role = String(user.role).toUpperCase();
    const flightId = Number(req.params.flightId);
    if (!Number.isInteger(flightId) || flightId <= 0) {
      return res.status(400).json({ message: 'Invalid flight id' });
    }

    const flight = await prisma.flight.findUnique({
      where: { id: flightId },
      include: { event: { include: { league: { select: { adminId: true } } } } },
    });

    if (!flight) {
      return res.status(404).json({ message: 'Flight not found' });
    }

    if (role === 'SUPER' || flight.event.league.adminId === user.id) {
      return next();
    }

    return res.sendStatus(403);
  } catch (error) {
    console.error('Flight auth error:', error);
    return res.sendStatus(500);
  }
};
