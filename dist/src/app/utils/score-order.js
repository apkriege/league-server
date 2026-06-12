"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEventScoreAccess = exports.getLeagueScoreOrder = void 0;
const prisma_1 = require("../../prisma");
const isCompletedEvent = (event) => event.isComplete || String(event.status || '').toLowerCase() === 'completed';
const hasAnyScores = (event) => Number(event._count?.rounds || 0) > 0 || isCompletedEvent(event);
const getLeagueScoreOrder = async (leagueId) => {
    const events = await prisma_1.prisma.event.findMany({
        where: {
            leagueId,
            isDeleted: false,
        },
        select: {
            id: true,
            status: true,
            isComplete: true,
            _count: {
                select: {
                    rounds: true,
                },
            },
        },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    const nextScorableEvent = events.find((event) => !isCompletedEvent(event)) || null;
    const latestScoredEvent = [...events].reverse().find((event) => hasAnyScores(event)) || null;
    return {
        nextScorableEventId: nextScorableEvent ? Number(nextScorableEvent.id) : null,
        latestScoredEventId: latestScoredEvent ? Number(latestScoredEvent.id) : null,
    };
};
exports.getLeagueScoreOrder = getLeagueScoreOrder;
const buildEventScoreAccess = (eventId, order) => ({
    canEnterScores: order.nextScorableEventId === Number(eventId),
    canEditScores: order.latestScoredEventId === Number(eventId),
});
exports.buildEventScoreAccess = buildEventScoreAccess;
