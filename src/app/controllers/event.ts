import { prisma } from '../../prisma';
import { Request, Response } from 'express';
import EventService from '../models/event';
import LeagueService from '../models/league';
import { extractTeamId, FlightGen } from '../services/flightGen';
import {
  normalizeEventFormat,
  normalizeScoringFormat,
  validateEventMode,
} from '../utils/event-mode';
import { buildEventScoreAccess, getLeagueScoreOrder } from '../utils/score-order';
import { writeAuditLog } from '../utils/audit';
import { getPublicErrorResponse } from '../utils/error-response';

import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { EventMetrics } from '../services/eventMetrics';
dayjs.extend(customParseFormat);

class EventController {
  static getAdminEvent = async (req: Request, res: Response) => {
    try {
      const event = await EventService.findById(Number(req.params.eventId));
      if (!event) {
        res.status(404).send('Event not found');
        return;
      }
      res.status(200).send(event);
    } catch (error) {
      console.error(error);
      const { status, message } = getPublicErrorResponse(error);
      res.status(status).json({ message });
    }
  };

  static getEvents = async (req: Request, res: Response) => {
    try {
      const events = await EventService.findAll();
      res.status(200).send(events);
    } catch (error) {
      console.error(error);
      const { status, message } = getPublicErrorResponse(error);
      res.status(status).json({ message });
    }
  };

  // GET LEAGUE EVENTS
  static getLeagueEvents = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);

      const events = await prisma.event.findMany({
        where: { leagueId, isDeleted: false, deletedAt: null },
        include: {
          course: true,
          tee: {
            select: {
              id: true,
              name: true,
              distance: true,
            },
          },
          flights: {
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
        },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      });
      const scoreOrder = await getLeagueScoreOrder(leagueId);

      res.status(200).send(
        events.map((event: any) => ({
          ...event,
          ...buildEventScoreAccess(Number(event.id), scoreOrder),
        })),
      );
    } catch (error) {
      console.error(error);
      const { status, message } = getPublicErrorResponse(error);
      res.status(status).json({ message });
    }
  };

  // GET LEAGUE EVENT DETAILS (INCLUDING FLIGHTS AND ROUNDS)
  static getLeagueEvent = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const eventId = Number(req.params.eventId);

      const event = await prisma.event.findFirst({
        where: { id: eventId, leagueId, isDeleted: false, deletedAt: null },
        include: {
          course: true,
          tee: true,
          flights: {
            include: {
              players: {
                include: {
                  player: {
                    include: {
                      team: true,
                      rounds: {
                        take: 1,
                        where: { eventId },
                        include: {
                          scores: {
                            select: {
                              hole: true,
                              gross: true,
                            },
                            orderBy: { hole: 'asc' },
                          },
                        },
                      },
                    },
                  },
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
        },
      });

      if (!event) {
        res.status(404).send('Event not found');
        return;
      }

      const scoreOrder = await getLeagueScoreOrder(leagueId);

      const metrics = new EventMetrics(eventId);
      const x = await metrics.processEvent();

      const eventWithMetrics = {
        ...event,
        ...buildEventScoreAccess(Number(event.id), scoreOrder),
        metrics: x,
      };

      res.status(200).send(eventWithMetrics);
    } catch (error) {
      console.error(error);
      const { status, message } = getPublicErrorResponse(error);
      res.status(status).json({ message });
    }
  };


  // GET LEAGUE EVENT ROUNDS AND SCORES
  static getLeagueEventRounds = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const eventId = Number(req.params.eventId);

      const scores = await prisma.round.findMany({
        where: {
          eventId,
          deletedAt: null,
          event: { leagueId, isDeleted: false, deletedAt: null },
        },
        include: {
          player: {
            include: {
              team: true,
            },
          },
          scores: true,
        },
      });

      const event = await prisma.event.findFirst({
        where: { id: eventId, leagueId, isDeleted: false, deletedAt: null },
        include: {
          course: true,
          tee: true,
          flights: {
            where: { eventId, deletedAt: null },
            include: {
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
        },
      });

      if (!event) {
        res.status(404).send('Flights not found');
        return;
      }

      if (!scores) {
        res.status(404).send('Scores not found');
        return;
      }

      const ev = {
        ...event,
        flights: event.flights.map((flight: any) => ({
          ...flight,
          teams: flight.teams.map((t: any) => ({
            ...t,
            team: {
              ...t.team,
              players: t.team.players.map((p: any) => ({
                ...p,
                scores: scores.filter((s: any) => s.playerId === p.id),
              })),
            },
          })),
        })),
      };

      res.status(200).send(ev);
    } catch (error) {
      console.error(error);
      const { status, message } = getPublicErrorResponse(error);
      res.status(status).json({ message });
    }
  };

  // CREATE EVENT
  static createEvent = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const eventData = req.body;
      const league = await LeagueService.query().findFirst({
        where: { id: leagueId, deletedAt: null },
        include: {
          players: { where: { deletedAt: null } },
          teams: {
            where: { deletedAt: null },
            include: {
              players: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      if (!league) {
        res.status(404).send('League not found');
        return;
      }

      validateEventDateWithinLeague(eventData?.date, league);

      const newEvent = await prisma.$transaction(async (tx: any) => {
        await validateCourseAndTee(tx, eventData?.courseId, eventData?.teeId);
        const forcedFormat = resolveEventFormatForLeague(league, eventData?.format);
        const normalizedScoringFormat = normalizeScoringFormat(eventData?.scoringFormat, 'stroke');
        const pointsEnabled = eventData?.pointsEnabled !== false;
        const normalizedStrokePoints = normalizeStrokePoints(
          eventData?.strokePoints,
          forcedFormat,
          normalizedScoringFormat,
          pointsEnabled,
        );
        validateEventMode(forcedFormat, normalizedScoringFormat);
        const { normalizedEventData, createdLeagueTeams } = await createEventTeamsAndRemapFlights(
          tx,
          leagueId,
          {
            ...eventData,
            format: forcedFormat,
            scoringFormat: normalizedScoringFormat,
            pointsEnabled,
            strokePoints: normalizedStrokePoints,
          },
          league,
        );

        const { flights, ...e } = normalizedEventData;

        const created = await tx.event.create({
          data: {
            leagueId: leagueId,
            status: 'upcoming',
            courseId: Number(e.courseId),
            teeId: Number(e.teeId),
            name: e.name,
            date: toEventDateTime(e.date),
            startTime: e.startTime,
            startSide: e.startSide,
            interval: e.interval,
            format: forcedFormat,
            scoringFormat: normalizedScoringFormat,
            pointsEnabled,
            ptsPerHole: Number(e.ptsPerHole),
            ptsPerMatch: Number(e.ptsPerMatch),
            ptsPerTeamWin: Number(e.ptsPerTeamWin),
            strokePoints: normalizeStrokePoints(
              e.strokePoints,
              forcedFormat,
              normalizedScoringFormat,
              pointsEnabled,
            ),
            type: e.type,
            holes: e.holes,
            ...(createdLeagueTeams.length > 0
              ? {
                  teams: {
                    connect: createdLeagueTeams.map((team: any) => ({ id: team.id })),
                  },
                }
              : {}),
          },
        });

        const leagueForFlights =
          createdLeagueTeams.length > 0 ? { ...league, teams: createdLeagueTeams } : league;

        const flightGen = new FlightGen(leagueForFlights, normalizedEventData, created.id, tx);
        await flightGen.saveFlights();

        return created;
      });

      await prisma.league_onboarding.upsert({
        where: { leagueId },
        create: { leagueId, firstEventCreatedAt: new Date() },
        update: { firstEventCreatedAt: new Date() },
      });

      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId,
        entity: 'event',
        entityId: newEvent.id,
        action: 'create',
        summary: `Created event ${newEvent.name}.`,
      });

      res.status(201).send(newEvent);
    } catch (error) {
      console.error(error);
      const { status, message } = getPublicErrorResponse(error);
      res.status(status).json({ message });
    }
  };

  // CREATE MULTIPLE EVENTS
  static createMultipleEvents = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const eventsData = req.body.events;

      const league = await LeagueService.query().findFirst({
        where: { id: leagueId, deletedAt: null },
        include: {
          players: { where: { deletedAt: null } },
          teams: {
            where: { deletedAt: null },
            include: {
              players: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      if (!league) {
        res.status(404).send('League not found');
        return;
      }

      for (const eventData of eventsData) {
        validateEventDateWithinLeague(eventData?.date, league);
      }

      const createdEvents = await prisma.$transaction(async (tx: any) => {
        const createdEventsInTransaction = [];
        for (const eventData of eventsData) {
          await validateCourseAndTee(tx, eventData?.courseId, eventData?.teeId);
          const forcedFormat = resolveEventFormatForLeague(league, eventData?.format);
          const normalizedScoringFormat = normalizeScoringFormat(eventData?.scoringFormat, 'stroke');
          const pointsEnabled = eventData?.pointsEnabled !== false;
          const normalizedStrokePoints = normalizeStrokePoints(
            eventData?.strokePoints,
            forcedFormat,
            normalizedScoringFormat,
            pointsEnabled,
          );
          validateEventMode(forcedFormat, normalizedScoringFormat);
          const { flights: _flights, ...e } = {
            ...eventData,
            format: forcedFormat,
            scoringFormat: normalizedScoringFormat,
            pointsEnabled,
            strokePoints: normalizedStrokePoints,
          };

          const createdEvent = await tx.event.create({
            data: {
              leagueId: leagueId,
              status: 'upcoming',
              courseId: Number(e.courseId),
              teeId: Number(e.teeId),
              name: e.name,
              date: toEventDateTime(e.date),
              startTime: e.startTime,
              startSide: e.startSide,
              interval: e.interval,
              format: forcedFormat,
              scoringFormat: normalizedScoringFormat,
              pointsEnabled,
              ptsPerHole: Number(e.ptsPerHole),
              ptsPerMatch: Number(e.ptsPerMatch),
              ptsPerTeamWin: Number(e.ptsPerTeamWin),
              strokePoints: normalizeStrokePoints(
                e.strokePoints,
                forcedFormat,
                normalizedScoringFormat,
                pointsEnabled,
              ),
              type: e.type,
              holes: e.holes,
            },
          });

          const flightGen = new FlightGen(
            league,
            { ...eventData, format: forcedFormat, scoringFormat: normalizedScoringFormat },
            createdEvent.id,
            tx,
          );
          await flightGen.saveFlights();

          createdEventsInTransaction.push(createdEvent);
        }
        return createdEventsInTransaction;
      });

      await prisma.league_onboarding.upsert({
        where: { leagueId },
        create: { leagueId, firstEventCreatedAt: new Date() },
        update: { firstEventCreatedAt: new Date() },
      });

      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId,
        entity: 'event',
        action: 'create_many',
        summary: `Created ${createdEvents.length} events.`,
        metadata: { eventIds: createdEvents.map((event) => event.id) },
      });

      res.status(201).send(createdEvents);
    } catch (error) {
      console.error(error);
      const { status, message } = getPublicErrorResponse(error);
      res.status(status).json({ message });
    }
  };

  // UPDATE EVENT
  static updateEvent = async (req: Request, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      const leagueId = Number(req.params.leagueId);
      const eventData = req.body;
      delete eventData.id;

      const eventLeague = await prisma.league.findFirst({
        where: { id: leagueId, deletedAt: null },
        select: { startDate: true, endDate: true },
      });
      if (!eventLeague) {
        return res.status(404).json({ message: 'League not found' });
      }
      validateEventDateWithinLeague(eventData?.date, eventLeague);

      const existingEvent = await prisma.event.findFirst({
        where: { id: eventId, leagueId, isDeleted: false, deletedAt: null },
        select: {
          id: true,
          status: true,
          isComplete: true,
          _count: { select: { rounds: true } },
        },
      });

      if (!existingEvent) {
        res.status(404).send('Event not found');
        return;
      }

      const isCompletedEvent =
        Boolean(existingEvent.isComplete) ||
        String(existingEvent.status || '').toLowerCase() === 'completed';
      const isCanceledEvent = String(existingEvent.status || '').toLowerCase() === 'canceled';

      if (isCompletedEvent) {
        res.status(409).json({ message: 'Completed events cannot be edited' });
        return;
      }
      if (isCanceledEvent) {
        res.status(409).json({ message: 'Canceled events cannot be edited' });
        return;
      }
      if (existingEvent._count.rounds > 0) {
        res.status(409).json({ message: 'Events with scores cannot have their setup edited' });
        return;
      }

      // have to delete and recreate flights to update players/teams in flights, which is the main reason for using a transaction here
      await prisma.$transaction(async (tx: any) => {
        await validateCourseAndTee(tx, eventData?.courseId, eventData?.teeId);

        const flightIds = await tx.flight.findMany({
          where: { eventId },
          select: { id: true },
        });
        await tx.flight_player.deleteMany({
          where: { flightId: { in: flightIds.map((f: { id: number }) => f.id) } },
        });
        await tx.flight_team.deleteMany({
          where: { flightId: { in: flightIds.map((f: { id: number }) => f.id) } },
        });
        await tx.flight.deleteMany({ where: { eventId } });

        const league = await LeagueService.query().findFirst({
          where: { id: leagueId, deletedAt: null },
          include: {
            players: { where: { deletedAt: null } },
            teams: {
              where: { deletedAt: null },
              include: {
                players: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        });

        if (!league) {
          throw new Error('League not found');
        }

        const forcedFormat = resolveEventFormatForLeague(league, eventData?.format);
        const normalizedScoringFormat = normalizeScoringFormat(eventData?.scoringFormat, 'stroke');
        const pointsEnabled = eventData?.pointsEnabled !== false;
        const normalizedStrokePoints = normalizeStrokePoints(
          eventData?.strokePoints,
          forcedFormat,
          normalizedScoringFormat,
          pointsEnabled,
        );
        validateEventMode(forcedFormat, normalizedScoringFormat);
        eventData.format = forcedFormat;
        eventData.scoringFormat = normalizedScoringFormat;
        eventData.pointsEnabled = pointsEnabled;
        eventData.strokePoints = normalizedStrokePoints;

        await tx.event.update({
          where: { id: eventId },
          data: {
            courseId: Number(eventData.courseId),
            teeId: Number(eventData.teeId),
            name: eventData.name,
            date: toEventDateTime(eventData.date),
            type: eventData.type,
            holes: eventData.holes,
            startTime: eventData.startTime,
            startSide: eventData.startSide,
            interval: eventData.interval,
            format: forcedFormat,
            scoringFormat: normalizedScoringFormat,
            pointsEnabled,
            ptsPerHole: Number(eventData.ptsPerHole),
            ptsPerMatch: Number(eventData.ptsPerMatch),
            ptsPerTeamWin: Number(eventData.ptsPerTeamWin),
            strokePoints: normalizeStrokePoints(
              eventData.strokePoints,
              forcedFormat,
              normalizedScoringFormat,
              pointsEnabled,
            ),
          },
        });

        const flightGen = new FlightGen(league, eventData, eventId, tx);
        await flightGen.saveFlights();
      });

      const updatedEvent = await prisma.event.findUnique({ where: { id: eventId } });
      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId,
        entity: 'event',
        entityId: eventId,
        action: 'update',
        summary: `Updated event ${updatedEvent?.name || eventId}.`,
      });
      res.status(200).send(updatedEvent);
    } catch (error) {
      console.error(error);
      const { status, message } = getPublicErrorResponse(error);
      res.status(status).json({ message });
    }
  };

  // CANCEL EVENT
  static cancelEvent = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const eventId = Number(req.params.eventId);

      const event = await prisma.event.findFirst({
        where: { id: eventId, leagueId, isDeleted: false, deletedAt: null },
        select: {
          id: true,
          name: true,
          leagueId: true,
          status: true,
          isComplete: true,
          _count: { select: { rounds: true } },
        },
      });

      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }

      const normalizedStatus = String(event.status || '').toLowerCase();
      if (normalizedStatus === 'canceled') {
        return res.status(200).send(event);
      }

      if (event.isComplete || normalizedStatus === 'completed' || Number(event._count?.rounds || 0) > 0) {
        return res.status(409).json({ message: 'Events with scores cannot be canceled.' });
      }

      const canceledEvent = await prisma.event.update({
        where: { id: eventId },
        data: {
          status: 'canceled',
          isComplete: false,
        },
      });

      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId,
        entity: 'event',
        entityId: eventId,
        action: 'cancel',
        summary: `Canceled event ${event.name || eventId}.`,
      });

      res.status(200).send(canceledEvent);
    } catch (error) {
      console.error(error);
      const { status, message } = getPublicErrorResponse(error);
      res.status(status).json({ message });
    }
  };

  // DELETE (SOFT) EVENT
  static deleteEvent = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const eventId = Number(req.params.eventId);

      const event = await prisma.event.findFirst({
        where: { id: eventId, leagueId, isDeleted: false, deletedAt: null },
        select: {
          id: true,
          name: true,
          leagueId: true,
          status: true,
          isComplete: true,
          _count: { select: { rounds: true } },
        },
      });

      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }

      if (event.isComplete || event.status === 'completed' || event._count.rounds > 0) {
        return res.status(409).json({ message: 'Events with scores cannot be deleted.' });
      }

      const deletedEvent = await prisma.event.update({
        where: { id: eventId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId,
        entity: 'event',
        entityId: eventId,
        action: 'delete',
        summary: `Deleted event ${event.name || eventId}.`,
      });

      res.status(200).send(deletedEvent);
    } catch (error) {
      console.error(error);
      const { status, message } = getPublicErrorResponse(error);
      res.status(status).json({ message });
    }
  };
}

export default EventController;

const toEventDateTime = (input: unknown): Date => {
  if (input instanceof Date) return input;

  if (typeof input === 'string') {
    const trimmed = input.trim();

    const dateOnly = dayjs(trimmed, 'YYYY-MM-DD', true);
    if (dateOnly.isValid()) {
      // Store date-only payloads at noon UTC so US local rendering does not shift to the prior day.
      return new Date(`${trimmed}T12:00:00.000Z`);
    }

    const dt = new Date(trimmed);
    if (!Number.isNaN(dt.getTime())) {
      return dt;
    }
  }

  throw new Error('Invalid event date. Expected YYYY-MM-DD or ISO-8601 DateTime.');
};

const toDateOnlyKey = (input: unknown): string => {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return input.toISOString().slice(0, 10);
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateOnly) return dateOnly[1];

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  throw new Error('Invalid event date. Expected YYYY-MM-DD or ISO-8601 DateTime.');
};

const validateEventDateWithinLeague = (eventDate: unknown, league: any) => {
  const eventDateKey = toDateOnlyKey(eventDate);
  const leagueStartKey = toDateOnlyKey(league.startDate);
  const leagueEndKey = toDateOnlyKey(league.endDate);

  if (eventDateKey < leagueStartKey || eventDateKey > leagueEndKey) {
    throw new Error(
      `Event date must be within the league date range (${leagueStartKey} to ${leagueEndKey}).`,
    );
  }
};

const validateCourseAndTee = async (db: any, rawCourseId: unknown, rawTeeId: unknown) => {
  const courseId = Number(rawCourseId);
  const teeId = Number(rawTeeId);
  if (!Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(teeId) || teeId <= 0) {
    throw new Error('A valid course and tee are required.');
  }

  const tee = await db.tee.findFirst({
    where: {
      id: teeId,
      courseId,
      deletedAt: null,
      course: { deletedAt: null },
    },
    select: { id: true },
  });

  if (!tee) {
    throw new Error('Selected tee does not belong to the selected course.');
  }
};

const normalizeStrokePoints = (
  raw: unknown,
  format: string,
  scoringFormat: string,
  pointsEnabled = true,
) => {
  const normalizedFormat = String(format || '').toLowerCase();
  if (!pointsEnabled) return null;
  if (!['individual', 'team'].includes(normalizedFormat)) return null;
  if (String(scoringFormat || '').toLowerCase() !== 'stroke') return null;

  if (Array.isArray(raw)) {
    const arr = raw
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0);
    return arr.length > 0 ? arr : null;
  }

  if (typeof raw === 'string') {
    const arr = raw
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value >= 0);
    return arr.length > 0 ? arr : null;
  }

  return null;
};

const normalizeIds = (ids: any[] = []) =>
  ids
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => a - b);

const createEventTeamsAndRemapFlights = async (
  tx: any,
  leagueId: number,
  eventData: any,
  league: any,
) => {
  const isSeasonTeamLeague =
    String(league?.type || '').toLowerCase() === 'season' &&
    String(league?.format || '').toLowerCase() === 'team';

  // Season team leagues already have persistent teams. Reuse those IDs directly.
  if (isSeasonTeamLeague) {
    return {
      normalizedEventData: {
        ...eventData,
        teams: (league?.teams || []).map((team: any) => ({
          id: Number(team.id),
          name: team.name,
          players: (team.players || []).map((p: any) => ({ id: Number(p.id) })),
        })),
      },
      createdLeagueTeams: [],
    };
  }

  if (eventData?.format !== 'team') {
    return {
      normalizedEventData: eventData,
      createdLeagueTeams: [],
    };
  }

  const incomingTeams = Array.isArray(eventData?.teams) ? eventData.teams : [];
  const incomingFlights = Array.isArray(eventData?.flights) ? eventData.flights : [];

  if (incomingTeams.length === 0) {
    throw new Error('Team events require teams in the payload.');
  }

  const tempToLeagueTeamId = new Map<string, number>();
  const createdLeagueTeams: any[] = [];

  for (const incomingTeam of incomingTeams) {
    const incomingTeamId = extractTeamId(incomingTeam);
    if (incomingTeamId === null) {
      throw new Error('Team events require a numeric team id for each team.');
    }

    const incomingRoster = normalizeIds(incomingTeam?.players || []);

    const createdTeam = await tx.team.create({
      data: {
        leagueId,
        name: String(incomingTeam?.name || 'Team'),
        seasonPoints: 0,
      },
    });

    if (incomingRoster.length > 0) {
      await tx.player.updateMany({
        where: {
          leagueId,
          id: { in: incomingRoster },
        },
        data: {
          teamId: createdTeam.id,
        },
      });
    }

    tempToLeagueTeamId.set(String(incomingTeamId), createdTeam.id);
    createdLeagueTeams.push({
      id: createdTeam.id,
      name: createdTeam.name,
      players: incomingRoster.map((id) => ({ id })),
    });
  }

  const remappedFlights = incomingFlights.map((flight: any, idx: number) => {
    if (!Array.isArray(flight) || flight.length !== 2) {
      throw new Error(`Invalid flight format at index ${idx}. Expected [teamA, teamB].`);
    }

    const leftId = extractTeamId(flight[0]);
    const rightId = extractTeamId(flight[1]);

    if (leftId === null || rightId === null) {
      throw new Error(`Unable to parse one or more team IDs in flight index ${idx}.`);
    }

    const left = tempToLeagueTeamId.get(String(leftId));
    const right = tempToLeagueTeamId.get(String(rightId));

    if (!left || !right) {
      throw new Error(`Unable to map one or more team IDs in flight index ${idx}.`);
    }

    return [left, right];
  });

  return {
    normalizedEventData: {
      ...eventData,
      flights: remappedFlights,
    },
    createdLeagueTeams,
  };
};

const resolveEventFormatForLeague = (league: any, incomingFormat: any) => {
  if (String(league?.type || '').toLowerCase() === 'season' && league?.format) {
    return normalizeEventFormat(league.format, 'individual');
  }

  return normalizeEventFormat(incomingFormat, 'individual');
};
