"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma_1 = require("../../prisma");
class TeamController {
    static buildTeamInclude = () => client_1.Prisma.validator()({
        players: {
            where: { deletedAt: null },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        },
        teamEventPoints: {
            include: {
                event: {
                    select: {
                        id: true,
                        name: true,
                        date: true,
                    },
                },
            },
            orderBy: {
                event: {
                    date: 'asc',
                },
            },
        },
    });
    static normalizePlayerIds = (rawPlayers) => {
        if (!Array.isArray(rawPlayers))
            return [];
        const ids = rawPlayers
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0);
        return [...new Set(ids)];
    };
    static getTeams = async (req, res) => {
        try {
            const teams = await prisma_1.prisma.team.findMany({
                where: { deletedAt: null },
                include: TeamController.buildTeamInclude(),
                orderBy: [{ name: 'asc' }],
            });
            res.status(200).json(teams);
        }
        catch (error) {
            console.error(error);
            res.status(500).send(error);
        }
    };
    static getLeagueTeams = async (req, res) => {
        try {
            const { leagueId } = req.params;
            if (!leagueId) {
                return res.status(400).json({ message: 'leagueId is required' });
            }
            const teams = await prisma_1.prisma.team.findMany({
                where: { leagueId: Number(leagueId), deletedAt: null },
                include: TeamController.buildTeamInclude(),
                orderBy: [{ name: 'asc' }],
            });
            res.status(200).send(teams);
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
    static getTeam = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!id) {
                return res.status(400).json({ message: 'Team ID is required' });
            }
            const team = await prisma_1.prisma.team.findFirst({
                where: { id, deletedAt: null },
                include: TeamController.buildTeamInclude(),
            });
            if (!team) {
                return res.status(404).json({ message: 'Team not found' });
            }
            const leagueId = Number(team.leagueId);
            const playerIds = team.players.map((player) => Number(player.id));
            const now = new Date();
            const [recentRounds, upcomingEvents] = await Promise.all([
                playerIds.length > 0
                    ? prisma_1.prisma.round.findMany({
                        where: {
                            playerId: { in: playerIds },
                            deletedAt: null,
                            status: 'completed',
                            event: {
                                leagueId,
                                isDeleted: false,
                                deletedAt: null,
                            },
                        },
                        include: {
                            player: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                },
                            },
                            event: {
                                select: {
                                    id: true,
                                    name: true,
                                    date: true,
                                    scoringFormat: true,
                                    format: true,
                                },
                            },
                        },
                        orderBy: [{ date: 'desc' }, { id: 'desc' }],
                        take: 12,
                    })
                    : [],
                leagueId
                    ? prisma_1.prisma.event.findMany({
                        where: {
                            leagueId,
                            isDeleted: false,
                            deletedAt: null,
                            status: { not: 'canceled' },
                            date: { gte: now },
                        },
                        select: {
                            id: true,
                            name: true,
                            date: true,
                            startTime: true,
                            format: true,
                            scoringFormat: true,
                            holes: true,
                            status: true,
                        },
                        orderBy: [{ date: 'asc' }, { id: 'asc' }],
                        take: 6,
                    })
                    : [],
            ]);
            res.status(200).json({
                ...team,
                recentRounds,
                upcomingEvents,
            });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
    static createTeam = async (req, res) => {
        try {
            const { leagueId } = req.params;
            const payload = req.body || {};
            if (!leagueId) {
                return res.status(400).json({ message: 'leagueId is required' });
            }
            const name = String(payload.name || '').trim();
            if (!name) {
                return res.status(400).json({ message: 'Team name is required' });
            }
            const numericLeagueId = Number(leagueId);
            const playerIds = TeamController.normalizePlayerIds(payload.players);
            const team = await prisma_1.prisma.$transaction(async (tx) => {
                const league = await tx.league.findFirst({
                    where: { id: numericLeagueId, deletedAt: null },
                    select: { id: true },
                });
                if (!league) {
                    throw new Error('League not found');
                }
                const duplicate = await tx.team.findFirst({
                    where: {
                        leagueId: numericLeagueId,
                        deletedAt: null,
                        name: { equals: name, mode: 'insensitive' },
                    },
                    select: { id: true },
                });
                if (duplicate) {
                    throw new Error('Team name already exists');
                }
                if (playerIds.length > 0) {
                    const players = await tx.player.findMany({
                        where: {
                            id: { in: playerIds },
                            leagueId: numericLeagueId,
                            deletedAt: null,
                        },
                        select: { id: true },
                    });
                    if (players.length !== playerIds.length) {
                        throw new Error('One or more selected players are invalid');
                    }
                }
                const createdTeam = await tx.team.create({
                    data: {
                        name,
                        leagueId: numericLeagueId,
                        seasonPoints: Number(payload.seasonPoints ?? 0),
                        seasonRank: payload.seasonRank != null ? Number(payload.seasonRank) : null,
                    },
                    select: { id: true },
                });
                if (playerIds.length > 0) {
                    await tx.player.updateMany({
                        where: {
                            leagueId: numericLeagueId,
                            id: { in: playerIds },
                        },
                        data: {
                            teamId: createdTeam.id,
                        },
                    });
                }
                return tx.team.findFirst({
                    where: { id: createdTeam.id, deletedAt: null },
                    include: TeamController.buildTeamInclude(),
                });
            });
            return res.status(201).json(team);
        }
        catch (error) {
            console.error(error);
            const message = String(error?.message || 'Internal server error');
            if (message === 'League not found') {
                return res.status(404).json({ message });
            }
            if (message === 'Team name already exists' ||
                message === 'One or more selected players are invalid') {
                return res.status(400).json({ message });
            }
            res.status(500).json({ message: 'Internal server error' });
        }
    };
    static updateTeam = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!id) {
                return res.status(400).json({ message: 'Team ID is required' });
            }
            const payload = req.body || {};
            const team = await prisma_1.prisma.$transaction(async (tx) => {
                const existingTeam = await tx.team.findFirst({
                    where: { id, deletedAt: null },
                    include: {
                        players: {
                            where: { deletedAt: null },
                            select: { id: true },
                        },
                    },
                });
                if (!existingTeam) {
                    throw new Error('Team not found');
                }
                const name = payload.name != null ? String(payload.name).trim() : existingTeam.name;
                if (!name) {
                    throw new Error('Team name is required');
                }
                const duplicate = await tx.team.findFirst({
                    where: {
                        leagueId: existingTeam.leagueId,
                        deletedAt: null,
                        id: { not: id },
                        name: { equals: name, mode: 'insensitive' },
                    },
                    select: { id: true },
                });
                if (duplicate) {
                    throw new Error('Team name already exists');
                }
                const playerIds = payload.players !== undefined
                    ? TeamController.normalizePlayerIds(payload.players)
                    : existingTeam.players.map((player) => Number(player.id));
                if (playerIds.length > 0) {
                    const players = await tx.player.findMany({
                        where: {
                            id: { in: playerIds },
                            leagueId: Number(existingTeam.leagueId),
                            deletedAt: null,
                        },
                        select: { id: true },
                    });
                    if (players.length !== playerIds.length) {
                        throw new Error('One or more selected players are invalid');
                    }
                }
                await tx.team.update({
                    where: { id },
                    data: {
                        name,
                        ...(payload.seasonPoints != null ? { seasonPoints: Number(payload.seasonPoints) } : {}),
                        ...(payload.seasonRank !== undefined
                            ? { seasonRank: payload.seasonRank == null ? null : Number(payload.seasonRank) }
                            : {}),
                    },
                });
                await tx.player.updateMany({
                    where: {
                        leagueId: Number(existingTeam.leagueId),
                        teamId: id,
                        id: { notIn: playerIds },
                    },
                    data: {
                        teamId: null,
                    },
                });
                if (playerIds.length > 0) {
                    await tx.player.updateMany({
                        where: {
                            leagueId: Number(existingTeam.leagueId),
                            id: { in: playerIds },
                        },
                        data: {
                            teamId: id,
                        },
                    });
                }
                return tx.team.findFirst({
                    where: { id, deletedAt: null },
                    include: this.buildTeamInclude(),
                });
            });
            if (!team) {
                return res.status(404).json({ message: 'Team not found' });
            }
            return res.status(200).json(team);
        }
        catch (error) {
            console.error(error);
            const message = String(error?.message || 'Internal server error');
            if (message === 'Team not found') {
                return res.status(404).json({ message });
            }
            if (message === 'Team name is required' ||
                message === 'Team name already exists' ||
                message === 'One or more selected players are invalid') {
                return res.status(400).json({ message });
            }
            res.status(500).json({ message: 'Internal server error' });
        }
    };
    static deleteTeam = async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!id) {
                return res.status(400).json({ message: 'Team ID is required' });
            }
            await prisma_1.prisma.$transaction(async (tx) => {
                const existingTeam = await tx.team.findFirst({
                    where: { id, deletedAt: null },
                    select: { id: true, leagueId: true },
                });
                if (!existingTeam) {
                    throw new Error('Team not found');
                }
                await tx.player.updateMany({
                    where: {
                        leagueId: Number(existingTeam.leagueId),
                        teamId: id,
                    },
                    data: {
                        teamId: null,
                    },
                });
                await tx.team.update({
                    where: { id },
                    data: { deletedAt: new Date() },
                });
            });
            return res.status(200).json({ message: 'Team removed' });
        }
        catch (error) {
            console.error(error);
            if (String(error?.message || '').includes('Team not found')) {
                return res.status(404).json({ message: 'Team not found' });
            }
            res.status(500).json({ message: 'Internal server error' });
        }
    };
}
exports.default = TeamController;
