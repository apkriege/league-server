"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyLeagueAdmins = exports.createNotification = void 0;
const prisma_1 = require("../../prisma");
const createNotification = async ({ userId, leagueId = null, type, title, body, metadata = null, }) => {
    try {
        return await prisma_1.prisma.notification.create({
            data: {
                userId,
                leagueId,
                type,
                title,
                body,
                ...(metadata ? { metadata } : {}),
            },
        });
    }
    catch (error) {
        console.error('notification error:', error instanceof Error ? error.message : error);
        return null;
    }
};
exports.createNotification = createNotification;
const notifyLeagueAdmins = async (leagueId, payload) => {
    const league = await prisma_1.prisma.league.findUnique({
        where: { id: leagueId },
        select: { adminId: true },
    });
    if (!league?.adminId)
        return null;
    return (0, exports.createNotification)({
        userId: league.adminId,
        leagueId,
        ...payload,
    });
};
exports.notifyLeagueAdmins = notifyLeagueAdmins;
