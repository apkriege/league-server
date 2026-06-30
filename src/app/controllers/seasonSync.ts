import { Request, Response } from 'express';
import { SeasonSync } from '../services/seasonSync';
import { writeAuditLog } from '../utils/audit';
import { getPublicErrorResponse } from '../utils/error-response';

export default class SeasonSyncController {
  static recalculateLeague = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const result = await SeasonSync.recalculateLeague(leagueId);

      await writeAuditLog({
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
    } catch (error) {
      const { status, message } = getPublicErrorResponse(error);
      return res.status(status).json({ message });
    }
  };
}
