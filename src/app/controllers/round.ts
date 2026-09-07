import { readFlightScoreSnapshot, recordScoreRevision } from '../services/scoreHistory';
import { lockScoringEvent, scoringTransactionOptions } from '../services/scoringTransaction';
import { Request, Response } from 'express';
import { prisma } from '../../prisma';
import { Round } from '../services/round';
import { SeasonSync } from '../services/seasonSync';
import { normalizeEventFormat } from '../utils/event-mode';
import { writeAuditLog } from '../utils/audit';
import { getPublicErrorResponse } from '../utils/error-response';
import { resolveScoreSubmissionOpponents } from '../utils/score-opponents';
import {
  getScoringFamilyForMode,
  getScoringMode,
  persistSharedTeamRounds,
} from '../scoring';


const validateScoreSubmission = async (
  db: any,
  event: any,
  flightId: number,
  rawPlayers: unknown,
  isEdit: boolean,
) => {
  if (!Number.isInteger(flightId) || flightId <= 0) {
    throw new Error('Flight id is invalid.');
  }
  if (!Array.isArray(rawPlayers) || rawPlayers.length === 0) {
    throw new Error('Players and scores are required.');
  }

  const flight = await db.flight.findFirst({
    where: { id: flightId, eventId: event.id, deletedAt: null },
    include: {
      players: { where: { deletedAt: null } },
      teams: { where: { deletedAt: null } },
    },
  });
  if (!flight) {
    throw new Error('Flight does not belong to this event.');
  }
  if (!isEdit && String(flight.status || '').toLowerCase() === 'completed') {
    throw new Error('Flight scores have already been entered.');
  }

  const submittedPlayerIds = rawPlayers.map((player: any) => Number(player?.playerId));
  if (
    submittedPlayerIds.some((id) => !Number.isInteger(id) || id <= 0) ||
    new Set(submittedPlayerIds).size !== submittedPlayerIds.length
  ) {
    throw new Error('Player ids must be valid and unique.');
  }

  const assignmentByPlayerId = new Map(
    flight.players.map((assignment: any) => [Number(assignment.playerId), assignment]),
  );
  if (
    submittedPlayerIds.length !== assignmentByPlayerId.size ||
    submittedPlayerIds.some((id) => !assignmentByPlayerId.has(id))
  ) {
    throw new Error('Scores must include exactly the players assigned to this flight.');
  }

  const eventFormat = normalizeEventFormat(event.format, 'individual');
  const scoringFamily = getScoringFamilyForMode(event.scoringMode);
  const resolvedOpponentByPlayerId = resolveScoreSubmissionOpponents({
    eventFormat,
    scoringFamily,
    assignments: flight.players,
    submittedPlayers: rawPlayers,
  });
  const players = rawPlayers.map((player: any) => ({
      ...player,
      playerId: Number(player.playerId),
      opponentId: resolvedOpponentByPlayerId.get(Number(player.playerId)) ?? null,
      points: 0,
      matchPoints: 0,
    }));

  return { players };
};

// Score seed - overall scores for each player in an event
export default class ScoreController {
  static getScoreHistory = async (req: Request, res: Response) => {
    try {
      const rows = await prisma.audit_log.findMany({
        where: { leagueId: Number(req.params.leagueId), entityId: Number(req.params.eventId), entity: 'score_revision' },
        orderBy: { id: 'desc' }, take: 100,
        select: { id: true, createdAt: true, metadata: true, user: { select: { firstName: true, lastName: true } } },
      });
      return res.json(rows);
    } catch (error) {
      const failure = getPublicErrorResponse(error);
      return res.status(failure.status).json({ message: failure.message });
    }
  };

  static restoreScores = async (req: Request, res: Response) => {
    try {
      const revision = await prisma.audit_log.findFirst({
        where: {
          id: Number(req.params.revisionId), leagueId: Number(req.params.leagueId),
          entityId: Number(req.params.eventId), entity: 'score_revision',
        },
      });
      const metadata = revision?.metadata;
      const version = req.body?.version === 'before' ? 'before' : 'after';
      const snapshot = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata[version] : null;
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        return res.status(404).json({ message: 'Score revision not found' });
      }
      req.body = { ...snapshot, eventId: Number(req.params.eventId) };
      return ScoreController.updateLeagueEventScores(req, res);
    } catch (error) {
      const failure = getPublicErrorResponse(error);
      return res.status(failure.status).json({ message: failure.message });
    }
  };

  static getLeagueEventScores = async (req: Request, res: Response) => {
    try {
      const { leagueId, eventId } = req.params;
      const numericLeagueId = Number(leagueId);
      const numericEventId = Number(eventId);

      const event = await prisma.event.findFirst({
        where: {
          id: numericEventId,
          leagueId: numericLeagueId,
          deletedAt: null,
        },
        include: {
          course: true,
          tee: true,
          routeSegments: {
            orderBy: { position: 'asc' },
            include: { course: true, tee: true },
          },
          flights: {
            where: { deletedAt: null },
            include: {
              players: {
                include: {
                  player: true,
                },
              },
              teams: {
                include: {
                  team: {
                    include: {
                      players: true,
                    },
                  },
                },
              },
            },
          },
          rounds: {
            where: { deletedAt: null },
            include: {
              player: {
                include: {
                  team: true,
                },
              },
              scores: true,
            },
          },
          teamRounds: {
            where: { deletedAt: null },
            include: { scores: { orderBy: { hole: 'asc' } }, team: true },
          },
        },
      });

      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }

      return res.status(200).json(event);
    } catch (error) {
      console.error('Error fetching league event scores:', error);
      return res.status(500).json({ message: 'Failed to fetch league event scores' });
    }
  };

  static createLeagueEventScores = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const eventId = Number(req.params.eventId);
      const flightId = Number(req.body?.flightId);
      if (req.body?.eventId != null && Number(req.body.eventId) !== eventId) {
        return res.status(400).json({ message: 'Request event id does not match the route.' });
      }

      const event = await prisma.event.findFirst({
        where: { id: eventId, leagueId, deletedAt: null },
      });
      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }
      if (String(event.status || '').toLowerCase() === 'canceled') {
        return res.status(409).json({ message: 'Canceled events cannot be scored.' });
      }
      if (String(event.status || '').toLowerCase() === 'completed') {
        return res.status(409).json({ message: 'Completed events cannot receive new scores.' });
      }

      await prisma.$transaction(async (tx) => {
        const event = await lockScoringEvent(tx, leagueId, eventId, false);
        const before = await readFlightScoreSnapshot(tx, eventId, flightId);
        const saveScores = async () => {
          const scoringMode = getScoringMode(event.scoringMode);
          if (scoringMode.scoreInput === 'shared-team-score') {
            await persistSharedTeamRounds({
              db: tx,
              eventId,
              flightId,
              rawTeamScores: req.body?.teamScores,
              isEdit: false,
            });
            await tx.flight.update({ where: { id: flightId }, data: { status: 'completed' } });
            const allFlights = await tx.flight.findMany({
              where: { eventId, deletedAt: null },
              select: { status: true },
            });
            if (allFlights.length > 0 && allFlights.every((flight) => flight.status === 'completed')) {
              await tx.event.update({
                where: { id: eventId },
                data: { status: 'completed' },
              });
            }
            await tx.league_onboarding.upsert({
              where: { leagueId },
              create: { leagueId, firstScoresEnteredAt: new Date() },
              update: { firstScoresEnteredAt: new Date() },
            });
            await SeasonSync.recalculateLeague(leagueId, tx);
            return;
          }

          const submission = await validateScoreSubmission(
            tx,
            event,
            flightId,
            req.body?.players,
            false,
          );

          for (const player of submission.players) {
            const normalizedPlayer = { ...player, points: 0, matchPoints: 0 };
            const round = new Round(eventId, normalizedPlayer, undefined, tx);
            await round.process();
          }

          await tx.flight.update({
            where: { id: flightId },
            data: { status: 'completed' },
          });

          const allFlights = await tx.flight.findMany({
            where: { eventId, deletedAt: null },
            select: { status: true },
          });
          if (allFlights.length > 0 && allFlights.every((flight) => flight.status === 'completed')) {
            await tx.event.update({
              where: { id: eventId },
              data: { status: 'completed' },
            });
          }

          await tx.league_onboarding.upsert({
            where: { leagueId },
            create: { leagueId, firstScoresEnteredAt: new Date() },
            update: { firstScoresEnteredAt: new Date() },
          });

          await SeasonSync.recalculateLeague(leagueId, tx);
        };
        await saveScores();
        await recordScoreRevision(tx, { eventId, leagueId, userId: req.session.userId ?? null, before });
      }, scoringTransactionOptions);

      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId,
        entity: 'event',
        entityId: eventId,
        action: 'create_scores',
        summary: `Entered scores for event ${event.name}.`,
      });

      return res.status(201).json({ message: 'Scores created successfully' });
    } catch (error) {
      console.error('Error parsing request data:', error);
      const { status, message } = getPublicErrorResponse(error);
      return res.status(status).json({ message });
    }
  };

  static updateLeagueEventScores = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const eventId = Number(req.params.eventId);
      const scoresData = req.body;
      const flightId = Number(scoresData?.flightId);

      if (scoresData?.eventId != null && Number(scoresData.eventId) !== eventId) {
        return res.status(400).json({ message: 'Request event id does not match the route.' });
      }

      const event = await prisma.event.findFirst({
        where: { id: eventId, leagueId, deletedAt: null },
      });
      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }
      if (String(event.status || '').toLowerCase() === 'canceled') {
        return res.status(409).json({ message: 'Canceled events cannot be updated.' });
      }

      await prisma.$transaction(async (tx) => {
        const event = await lockScoringEvent(tx, leagueId, eventId, true);
        const before = await readFlightScoreSnapshot(tx, eventId, flightId);
        const saveScores = async () => {
          const scoringMode = getScoringMode(event.scoringMode);
          if (scoringMode.scoreInput === 'shared-team-score') {
            await persistSharedTeamRounds({
              db: tx,
              eventId,
              flightId,
              rawTeamScores: scoresData?.teamScores,
              isEdit: true,
            });
            await tx.flight.update({ where: { id: flightId }, data: { status: 'completed' } });
            const allFlights = await tx.flight.findMany({
              where: { eventId, deletedAt: null },
              select: { status: true },
            });
            if (allFlights.length > 0 && allFlights.every((flight) => flight.status === 'completed')) {
              await tx.event.update({
                where: { id: eventId },
                data: { status: 'completed' },
              });
            }
            await SeasonSync.recalculateLeague(leagueId, tx);
            return;
          }

          const submission = await validateScoreSubmission(
            tx,
            event,
            flightId,
            scoresData?.players,
            true,
          );

          for (const player of submission.players) {
            const existingRound = await tx.round.findFirst({
              where: { eventId, playerId: player.playerId, deletedAt: null },
            });

            if (!existingRound) {
              throw new Error(
                `Round not found for player ${player.playerId} in this event.`,
              );
            }

            const normalizedPlayer = { ...player, points: 0, matchPoints: 0 };
            const round = new Round(eventId, normalizedPlayer, existingRound, tx);
            await round.process();
          }

          await tx.flight.update({
            where: { id: flightId },
            data: { status: 'completed' },
          });

          const allFlights = await tx.flight.findMany({
            where: { eventId, deletedAt: null },
            select: { status: true },
          });
          if (allFlights.length > 0 && allFlights.every((flight) => flight.status === 'completed')) {
            await tx.event.update({
              where: { id: eventId },
              data: { status: 'completed' },
            });
          }

          await SeasonSync.recalculateLeague(leagueId, tx);
        };
        await saveScores();
        await recordScoreRevision(tx, { eventId, leagueId, userId: req.session.userId ?? null, before });
      }, scoringTransactionOptions);

      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId,
        entity: 'event',
        entityId: eventId,
        action: 'update_scores',
        summary: `Updated scores for event ${event.name}.`,
      });

      return res.status(200).json({ message: 'Scores updated successfully' });
    } catch (error) {
      console.error('Error parsing request data:', error);
      const { status, message } = getPublicErrorResponse(error);
      return res.status(status).json({ message });
    }
  };
}
