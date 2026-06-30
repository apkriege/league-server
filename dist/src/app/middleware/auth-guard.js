"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.flightAdminGuard = exports.teamAdminGuard = exports.playerAdminGuard = exports.playerMemberGuard = exports.teamMemberGuard = exports.eventAdminGuard = exports.leagueMemberGuard = exports.leagueAdminGuard = exports.userSelfOrAdminGuard = exports.superAdminGuard = exports.userGuard = exports.adminGuard = void 0;
const user_1 = __importDefault(require("../models/user"));
const prisma_1 = require("../../prisma");
const logging_1 = require("./logging");
const getSessionUser = async (req) => {
    const userId = req.session.userId;
    if (!userId)
        return null;
    return user_1.default.findById(userId);
};
const hasLeagueCodeAccess = (req, leagueId) => {
    const leagueIds = req.session.leagueAccess?.leagueIds;
    return Array.isArray(leagueIds) && leagueIds.map(Number).includes(Number(leagueId));
};
const requireSessionUser = async (req, res, guardName = 'session') => {
    const user = await getSessionUser(req);
    if (!user) {
        (0, logging_1.logAuthFailure)(req, 'auth:unauthorized', { guard: guardName, reason: 'missing-session-user' });
        res.sendStatus(401);
        return null;
    }
    req.user = user;
    return user;
};
const adminGuard = (req, res, next) => {
    getSessionUser(req)
        .then((user) => {
        if (!user) {
            (0, logging_1.logAuthFailure)(req, 'auth:unauthorized', { guard: 'admin', reason: 'missing-session-user' });
            return res.status(401).json({ message: 'Not authenticated' });
        }
        const role = String(user.role).toUpperCase();
        if (role !== 'ADMIN' && role !== 'SUPER') {
            (0, logging_1.logAuthFailure)(req, 'auth:forbidden', {
                guard: 'admin',
                reason: 'insufficient-role',
                userId: user.id,
                role,
            });
            return res.status(403).json({ message: 'Admin access is required' });
        }
        req.user = user;
        next();
    })
        .catch((error) => {
        console.error('Session auth error:', error);
        return res.sendStatus(500);
    });
};
exports.adminGuard = adminGuard;
const userGuard = (req, res, next) => {
    getSessionUser(req)
        .then((user) => {
        if (!user) {
            (0, logging_1.logAuthFailure)(req, 'auth:unauthorized', { guard: 'user', reason: 'missing-session-user' });
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
exports.userGuard = userGuard;
const superAdminGuard = (req, res, next) => {
    getSessionUser(req)
        .then((user) => {
        if (!user) {
            (0, logging_1.logAuthFailure)(req, 'auth:unauthorized', {
                guard: 'super-admin',
                reason: 'missing-session-user',
            });
            return res.sendStatus(401);
        }
        if (String(user.role).toUpperCase() !== 'SUPER') {
            (0, logging_1.logAuthFailure)(req, 'auth:forbidden', {
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
exports.superAdminGuard = superAdminGuard;
const userSelfOrAdminGuard = async (req, res, next) => {
    try {
        const user = await requireSessionUser(req, res, 'user-self-or-admin');
        if (!user)
            return;
        const requestedUserId = Number(req.params.id);
        const role = String(user.role).toUpperCase();
        if (role === 'ADMIN' || role === 'SUPER' || user.id === requestedUserId) {
            return next();
        }
        (0, logging_1.logAuthFailure)(req, 'auth:forbidden', {
            guard: 'user-self-or-admin',
            reason: 'not-self-or-admin',
            userId: user.id,
            requestedUserId,
            role,
        });
        return res.sendStatus(403);
    }
    catch (error) {
        console.error('Session auth error:', error);
        return res.sendStatus(500);
    }
};
exports.userSelfOrAdminGuard = userSelfOrAdminGuard;
const leagueAdminGuard = async (req, res, next) => {
    try {
        const user = await requireSessionUser(req, res, 'league-admin');
        if (!user)
            return;
        const role = String(user.role).toUpperCase();
        const leagueId = Number(req.params.leagueId ?? req.params.id);
        if (!Number.isInteger(leagueId) || leagueId <= 0) {
            return res.status(400).json({ message: 'Invalid league id' });
        }
        const league = await prisma_1.prisma.league.findUnique({
            where: { id: leagueId },
            select: { adminId: true },
        });
        if (!league) {
            return res.status(404).json({ message: 'League not found' });
        }
        if (role === 'SUPER' || league.adminId === user.id) {
            return next();
        }
        (0, logging_1.logAuthFailure)(req, 'auth:forbidden', {
            guard: 'league-admin',
            reason: 'not-league-admin',
            userId: user.id,
            leagueId,
            role,
            leagueAdminId: league.adminId,
        });
        return res.sendStatus(403);
    }
    catch (error) {
        console.error('League auth error:', error);
        return res.sendStatus(500);
    }
};
exports.leagueAdminGuard = leagueAdminGuard;
const leagueMemberGuard = async (req, res, next) => {
    try {
        const leagueId = Number(req.params.leagueId ?? req.params.id);
        if (!Number.isInteger(leagueId) || leagueId <= 0) {
            return res.status(400).json({ message: 'Invalid league id' });
        }
        const user = await getSessionUser(req);
        if (!user && hasLeagueCodeAccess(req, leagueId)) {
            return next();
        }
        if (!user) {
            (0, logging_1.logAuthFailure)(req, 'auth:unauthorized', {
                guard: 'league-member',
                reason: 'missing-session-user-or-code',
                leagueId,
            });
            return res.sendStatus(401);
        }
        const role = String(user.role).toUpperCase();
        const league = await prisma_1.prisma.league.findUnique({
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
        const membership = await prisma_1.prisma.player.findFirst({
            where: { leagueId, userId: user.id, deletedAt: null },
            select: { id: true },
        });
        if (!membership) {
            (0, logging_1.logAuthFailure)(req, 'auth:forbidden', {
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
    }
    catch (error) {
        console.error('League member auth error:', error);
        return res.sendStatus(500);
    }
};
exports.leagueMemberGuard = leagueMemberGuard;
const eventAdminGuard = async (req, res, next) => {
    try {
        const user = await requireSessionUser(req, res, 'event-admin');
        if (!user)
            return;
        const role = String(user.role).toUpperCase();
        const eventId = Number(req.params.eventId);
        if (!Number.isInteger(eventId) || eventId <= 0) {
            return res.status(400).json({ message: 'Invalid event id' });
        }
        const event = await prisma_1.prisma.event.findUnique({
            where: { id: eventId },
            include: { league: { select: { adminId: true } } },
        });
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }
        if (role === 'SUPER' || event.league.adminId === user.id) {
            return next();
        }
        (0, logging_1.logAuthFailure)(req, 'auth:forbidden', {
            guard: 'event-admin',
            reason: 'not-event-admin',
            userId: user.id,
            eventId,
            role,
            leagueAdminId: event.league.adminId,
        });
        return res.sendStatus(403);
    }
    catch (error) {
        console.error('Event auth error:', error);
        return res.sendStatus(500);
    }
};
exports.eventAdminGuard = eventAdminGuard;
const teamMemberGuard = async (req, res, next) => {
    try {
        const teamId = Number(req.params.id);
        if (!Number.isInteger(teamId) || teamId <= 0) {
            return res.status(400).json({ message: 'Invalid team id' });
        }
        const team = await prisma_1.prisma.team.findUnique({
            where: { id: teamId },
            select: { leagueId: true, league: { select: { adminId: true } } },
        });
        if (!team) {
            return res.status(404).json({ message: 'Team not found' });
        }
        const user = await getSessionUser(req);
        if (!user && team.leagueId && hasLeagueCodeAccess(req, Number(team.leagueId))) {
            return next();
        }
        if (!user) {
            (0, logging_1.logAuthFailure)(req, 'auth:unauthorized', {
                guard: 'team-member',
                reason: 'missing-session-user-or-code',
                teamId,
                leagueId: team.leagueId,
            });
            return res.sendStatus(401);
        }
        const role = String(user.role).toUpperCase();
        if (role === 'SUPER' || team.league?.adminId === user.id) {
            req.user = user;
            return next();
        }
        const membership = await prisma_1.prisma.player.findFirst({
            where: { leagueId: Number(team.leagueId), userId: user.id, deletedAt: null },
            select: { id: true },
        });
        if (!membership) {
            (0, logging_1.logAuthFailure)(req, 'auth:forbidden', {
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
    }
    catch (error) {
        console.error('Team member auth error:', error);
        return res.sendStatus(500);
    }
};
exports.teamMemberGuard = teamMemberGuard;
const playerMemberGuard = async (req, res, next) => {
    try {
        const playerId = Number(req.params.id ?? req.params.playerId);
        if (!Number.isInteger(playerId) || playerId <= 0) {
            return res.status(400).json({ message: 'Invalid player id' });
        }
        const player = await prisma_1.prisma.player.findUnique({
            where: { id: playerId },
            select: { userId: true, leagueId: true, league: { select: { adminId: true } } },
        });
        if (!player) {
            return res.status(404).json({ message: 'Player not found' });
        }
        const user = await getSessionUser(req);
        if (!user && player.leagueId && hasLeagueCodeAccess(req, Number(player.leagueId))) {
            return next();
        }
        if (!user) {
            (0, logging_1.logAuthFailure)(req, 'auth:unauthorized', {
                guard: 'player-member',
                reason: 'missing-session-user-or-code',
                playerId,
                leagueId: player.leagueId,
            });
            return res.sendStatus(401);
        }
        const role = String(user.role).toUpperCase();
        if (role === 'SUPER' ||
            player.league?.adminId === user.id ||
            Number(player.userId || 0) === Number(user.id)) {
            req.user = user;
            return next();
        }
        const membership = await prisma_1.prisma.player.findFirst({
            where: { leagueId: Number(player.leagueId), userId: user.id, deletedAt: null },
            select: { id: true },
        });
        if (!membership) {
            (0, logging_1.logAuthFailure)(req, 'auth:forbidden', {
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
    }
    catch (error) {
        console.error('Player member auth error:', error);
        return res.sendStatus(500);
    }
};
exports.playerMemberGuard = playerMemberGuard;
const playerAdminGuard = async (req, res, next) => {
    try {
        const user = await requireSessionUser(req, res, 'player-admin');
        if (!user)
            return;
        const role = String(user.role).toUpperCase();
        const playerId = Number(req.params.id ?? req.params.playerId);
        if (!Number.isInteger(playerId) || playerId <= 0) {
            return res.status(400).json({ message: 'Invalid player id' });
        }
        const player = await prisma_1.prisma.player.findUnique({
            where: { id: playerId },
            include: { league: { select: { adminId: true } } },
        });
        if (!player) {
            return res.status(404).json({ message: 'Player not found' });
        }
        if (role === 'SUPER' || player.league?.adminId === user.id) {
            return next();
        }
        (0, logging_1.logAuthFailure)(req, 'auth:forbidden', {
            guard: 'player-admin',
            reason: 'not-player-admin',
            userId: user.id,
            playerId,
            role,
            leagueAdminId: player.league?.adminId,
        });
        return res.sendStatus(403);
    }
    catch (error) {
        console.error('Player auth error:', error);
        return res.sendStatus(500);
    }
};
exports.playerAdminGuard = playerAdminGuard;
const teamAdminGuard = async (req, res, next) => {
    try {
        const user = await requireSessionUser(req, res, 'team-admin');
        if (!user)
            return;
        const role = String(user.role).toUpperCase();
        const teamId = Number(req.params.id);
        if (!Number.isInteger(teamId) || teamId <= 0) {
            return res.status(400).json({ message: 'Invalid team id' });
        }
        const team = await prisma_1.prisma.team.findUnique({
            where: { id: teamId },
            include: { league: { select: { adminId: true } } },
        });
        if (!team) {
            return res.status(404).json({ message: 'Team not found' });
        }
        if (role === 'SUPER' || team.league?.adminId === user.id) {
            return next();
        }
        (0, logging_1.logAuthFailure)(req, 'auth:forbidden', {
            guard: 'team-admin',
            reason: 'not-team-admin',
            userId: user.id,
            teamId,
            role,
            leagueAdminId: team.league?.adminId,
        });
        return res.sendStatus(403);
    }
    catch (error) {
        console.error('Team auth error:', error);
        return res.sendStatus(500);
    }
};
exports.teamAdminGuard = teamAdminGuard;
const flightAdminGuard = async (req, res, next) => {
    try {
        const user = await requireSessionUser(req, res, 'flight-admin');
        if (!user)
            return;
        const role = String(user.role).toUpperCase();
        const flightId = Number(req.params.flightId);
        if (!Number.isInteger(flightId) || flightId <= 0) {
            return res.status(400).json({ message: 'Invalid flight id' });
        }
        const flight = await prisma_1.prisma.flight.findUnique({
            where: { id: flightId },
            include: { event: { include: { league: { select: { adminId: true } } } } },
        });
        if (!flight) {
            return res.status(404).json({ message: 'Flight not found' });
        }
        if (role === 'SUPER' || flight.event.league.adminId === user.id) {
            return next();
        }
        (0, logging_1.logAuthFailure)(req, 'auth:forbidden', {
            guard: 'flight-admin',
            reason: 'not-flight-admin',
            userId: user.id,
            flightId,
            role,
            leagueAdminId: flight.event.league.adminId,
        });
        return res.sendStatus(403);
    }
    catch (error) {
        console.error('Flight auth error:', error);
        return res.sendStatus(500);
    }
};
exports.flightAdminGuard = flightAdminGuard;
