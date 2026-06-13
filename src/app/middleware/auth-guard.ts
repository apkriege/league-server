import { Request, Response, NextFunction } from 'express';
import UserService from '../models/user';
import { prisma } from '../../prisma';
import { logAuthFailure } from './logging';

const getSessionUser = async (req: Request) => {
  const userId = req.session.userId;
  if (!userId) return null;
  return UserService.findById(userId);
};

const requireSessionUser = async (req: Request, res: Response, guardName = 'session') => {
  const user = await getSessionUser(req);
  if (!user) {
    logAuthFailure(req, 'auth:unauthorized', { guard: guardName, reason: 'missing-session-user' });
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
        logAuthFailure(req, 'auth:unauthorized', { guard: 'admin', reason: 'missing-session-user' });
        return res.sendStatus(401);
      }

      const role = String(user.role).toUpperCase();
      if (role !== 'ADMIN' && role !== 'SUPER') {
        logAuthFailure(req, 'auth:forbidden', {
          guard: 'admin',
          reason: 'insufficient-role',
          userId: user.id,
          role,
        });
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
        logAuthFailure(req, 'auth:unauthorized', { guard: 'user', reason: 'missing-session-user' });
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
        logAuthFailure(req, 'auth:unauthorized', {
          guard: 'super-admin',
          reason: 'missing-session-user',
        });
        return res.sendStatus(401);
      }

      if (String(user.role).toUpperCase() !== 'SUPER') {
        logAuthFailure(req, 'auth:forbidden', {
          guard: 'super-admin',
          reason: 'insufficient-role',
          userId: user.id,
          role: user.role,
        });
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
    const user = await requireSessionUser(req, res, 'user-self-or-admin');
    if (!user) return;

    const requestedUserId = Number(req.params.id);
    const role = String(user.role).toUpperCase();
    if (role === 'ADMIN' || role === 'SUPER' || user.id === requestedUserId) {
      return next();
    }

    logAuthFailure(req, 'auth:forbidden', {
      guard: 'user-self-or-admin',
      reason: 'not-self-or-admin',
      userId: user.id,
      requestedUserId,
      role,
    });
    return res.sendStatus(403);
  } catch (error) {
    console.error('Session auth error:', error);
    return res.sendStatus(500);
  }
};

export const leagueAdminGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await requireSessionUser(req, res, 'league-admin');
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

    logAuthFailure(req, 'auth:forbidden', {
      guard: 'league-admin',
      reason: 'not-league-admin',
      userId: user.id,
      leagueId,
      role,
      leagueAdminId: league.adminId,
    });
    return res.sendStatus(403);
  } catch (error) {
    console.error('League auth error:', error);
    return res.sendStatus(500);
  }
};

export const leagueMemberGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await requireSessionUser(req, res, 'league-member');
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
      logAuthFailure(req, 'auth:forbidden', {
        guard: 'league-member',
        reason: 'not-league-member',
        userId: user.id,
        leagueId,
        role,
      });
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
    const user = await requireSessionUser(req, res, 'event-admin');
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

    logAuthFailure(req, 'auth:forbidden', {
      guard: 'event-admin',
      reason: 'not-event-admin',
      userId: user.id,
      eventId,
      role,
      leagueAdminId: event.league.adminId,
    });
    return res.sendStatus(403);
  } catch (error) {
    console.error('Event auth error:', error);
    return res.sendStatus(500);
  }
};

export const teamMemberGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await requireSessionUser(req, res, 'team-member');
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
      logAuthFailure(req, 'auth:forbidden', {
        guard: 'team-member',
        reason: 'not-team-member',
        userId: user.id,
        teamId,
        leagueId: team.leagueId,
        role,
      });
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
    const user = await requireSessionUser(req, res, 'player-member');
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
      logAuthFailure(req, 'auth:forbidden', {
        guard: 'player-member',
        reason: 'not-player-member',
        userId: user.id,
        playerId,
        leagueId: player.leagueId,
        role,
      });
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
    const user = await requireSessionUser(req, res, 'player-admin');
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

    logAuthFailure(req, 'auth:forbidden', {
      guard: 'player-admin',
      reason: 'not-player-admin',
      userId: user.id,
      playerId,
      role,
      leagueAdminId: player.league?.adminId,
    });
    return res.sendStatus(403);
  } catch (error) {
    console.error('Player auth error:', error);
    return res.sendStatus(500);
  }
};

export const teamAdminGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await requireSessionUser(req, res, 'team-admin');
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

    logAuthFailure(req, 'auth:forbidden', {
      guard: 'team-admin',
      reason: 'not-team-admin',
      userId: user.id,
      teamId,
      role,
      leagueAdminId: team.league?.adminId,
    });
    return res.sendStatus(403);
  } catch (error) {
    console.error('Team auth error:', error);
    return res.sendStatus(500);
  }
};

export const flightAdminGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await requireSessionUser(req, res, 'flight-admin');
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

    logAuthFailure(req, 'auth:forbidden', {
      guard: 'flight-admin',
      reason: 'not-flight-admin',
      userId: user.id,
      flightId,
      role,
      leagueAdminId: flight.event.league.adminId,
    });
    return res.sendStatus(403);
  } catch (error) {
    console.error('Flight auth error:', error);
    return res.sendStatus(500);
  }
};
