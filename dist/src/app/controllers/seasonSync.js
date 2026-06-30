"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const seasonSync_1 = require("../services/seasonSync");
const audit_1 = require("../utils/audit");
const error_response_1 = require("../utils/error-response");
class SeasonSyncController {
    static recalculateLeague = async (req, res) => {
        try {
            const leagueId = Number(req.params.leagueId);
            const result = await seasonSync_1.SeasonSync.recalculateLeague(leagueId);
            await (0, audit_1.writeAuditLog)({
                userId: req.session.userId ?? null,
                leagueId,
                entity: 'league',
                entityId: leagueId,
                action: 'season_sync',
                summary: `Recalculated season scoring for league ${leagueId}.`,
                metadata: {
                    eventsProcessed: result.eventsProcessed,
                    roundsUpdated: result.roundsUpdated,
                    scoresUpdated: result.scoresUpdated,
                    playersUpdated: result.playersUpdated,
                    teamPointRowsUpdated: result.teamPointRowsUpdated,
                    skippedEvents: result.skippedEvents,
                },
            });
            return res.status(200).json({
                message: 'Season sync completed successfully.',
                result,
            });
        }
        catch (error) {
            const { status, message } = (0, error_response_1.getPublicErrorResponse)(error);
            return res.status(status).json({ message });
        }
    };
}
exports.default = SeasonSyncController;
