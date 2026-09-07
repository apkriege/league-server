import { lockScoringEvent } from '../services/scoringTransaction';
import { removeUnscoredEvent } from '../services/unscoredEvent';
import { prisma } from '../../prisma';
import { Request, Response } from 'express';
import LeagueService from '../models/league';
import { extractTeamId, FlightGen } from '../services/flightGen';
import {
  normalizeEventFlightTeamIds,
  resolveEventFlightTeams,
} from '../services/eventTeamResolution';
import {
  normalizeEventFormat,
  validateEventMode,
} from '../utils/event-mode';
import { buildEventScoreAccess } from '../utils/score-order';
import { writeAuditLog } from '../utils/audit';
import { getPublicErrorResponse } from '../utils/error-response';
import { EventMetrics } from '../services/eventMetrics';
import { localEventTimeToUtc, normalizeTimeZone } from '../utils/time-zone';
import {
  getCourseHoleCount,
  selectRoundHoles,
} from '../utils/tee-rating';
import {
  buildEventRouteSnapshot,
  modelEventTeeForRound,
  selectEventRouteHoles,
} from '../utils/event-route';
import {
  normalizeLeagueHoleFormat,
  validateEventHoleCount,
  validateEventHolesForLeague,
} from '../utils/league-hole-format';
import {
  normalizeLeagueScoringPeriods,
  scoringPeriodDateKey,
} from '../utils/league-scoring-periods';
import {
  getScoringFamily,
  getScoringMode,
  normalizeScoringConfiguration,
  validateScoringMode,
  type CompetitionModel,
} from '../scoring';

const resolveEventScoring = ({
  format,
  scoringMode,
  scoringConfig,
}: {
  format: CompetitionModel;
  scoringMode: unknown;
  scoringConfig: unknown;
}) => {
  const mode = getScoringMode(scoringMode).id;
  validateScoringMode(mode, format);
  return {
    scoringMode: mode,
    scoringFamily: getScoringFamily(mode),
    scoringConfig: normalizeScoringConfiguration(scoringConfig, mode),
  };
};

const canManageLeagueScores = async (req: Request, leagueId: number) => {
  const role = String(req.user?.role || '').toUpperCase();
  if (role === 'SUPER') return true;
  if (role !== 'ADMIN' || !req.session.userId) return false;

  const league = await prisma.league.findFirst({
    where: { id: leagueId, adminId: req.session.userId, deletedAt: null },
    select: { id: true },
  });
  return Boolean(league);
};

class EventController {
  // GET LEAGUE EVENTS
  static getLeagueEvents = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);

      const events = await prisma.event.findMany({
        where: { leagueId, deletedAt: null },
        include: {
          _count: { select: { rounds: true, teamRounds: true } },
          course: true,
          routeSegments: {
            orderBy: { position: 'asc' },
            include: { course: true, tee: true },
          },
          tee: {
            select: {
              id: true,
              name: true,
              distance: true,
            },
          },
          flights: {
            orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
            include: {
              players: {
                orderBy: { id: 'asc' },
                include: {
                  player: true,
                },
              },
              teams: {
                orderBy: { id: 'asc' },
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
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      });
      const canManageScores = await canManageLeagueScores(req, leagueId);
      res.status(200).send(
        events.map((event: any) => ({
          ...event,
          ...(canManageScores
            ? buildEventScoreAccess(event)
            : { canEnterScores: false, canEditScores: false }),
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

      const [event, metrics, canManageScores] = await Promise.all([
        prisma.event.findFirst({
          where: { id: eventId, leagueId, deletedAt: null },
          include: {
            _count: { select: { rounds: true, teamRounds: true } },
            league: { select: { holeFormat: true } },
            course: true,
            tee: true,
            routeSegments: {
              orderBy: { position: 'asc' },
              include: { course: true, tee: true },
            },
            teamRounds: {
              where: { deletedAt: null },
              include: { scores: { orderBy: { hole: 'asc' } }, team: true },
            },
            flights: {
              orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
              include: {
                players: {
                  orderBy: { id: 'asc' },
                  include: {
                    player: {
                      include: {
                        team: true,
                        rounds: {
                          take: 1,
                          where: { eventId, deletedAt: null },
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
                  orderBy: { id: 'asc' },
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
        }),
        new EventMetrics(eventId, leagueId).processEvent(),
        canManageLeagueScores(req, leagueId),
      ]);

      if (!event) {
        res.status(404).send('Event not found');
        return;
      }

      const historicalHandicaps = await getHistoricalEventHandicaps(event);

      const eventWithMetrics = {
        ...addEventRoundSetup(event, historicalHandicaps),
        ...(canManageScores
          ? buildEventScoreAccess(event)
          : { canEnterScores: false, canEditScores: false }),
        metrics,
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
          event: { leagueId, deletedAt: null },
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
        where: { id: eventId, leagueId, deletedAt: null },
        include: {
          course: true,
          tee: true,
          routeSegments: {
            orderBy: { position: 'asc' },
            include: { course: true, tee: true },
          },
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
      const eventHoles = validateEventHoleCount(eventData?.holes);
      validateEditableEventDetails(eventData);

      const newEvent = await prisma.$transaction(async (tx: any) => {
        const roundConfig = await validateCourseAndTee(
          tx,
          eventData?.courseId,
          eventData?.teeId,
          eventHoles,
          eventData?.startSide,
          eventData?.secondCourseId,
          eventData?.secondTeeId,
          eventData?.repeatFirstNine,
        );
        validateEventHolesForLeague(
          league.holeFormat,
          roundConfig.holes,
          roundConfig.courseHoles,
        );
        const timeZone = roundConfig.timeZone;
        const forcedFormat = resolveEventFormatForLeague(league, eventData?.format);
        const scoring = resolveEventScoring({
          format: forcedFormat,
          scoringMode: eventData?.scoringMode,
          scoringConfig: eventData?.scoringConfig,
        });
        const scoringFamily = scoring.scoringFamily;
        const pointsEnabled = eventData?.pointsEnabled !== false;
        const normalizedStrokePoints = scoring.scoringMode === 'stableford'
          ? null
          : normalizeStrokePoints(
              eventData?.strokePoints,
              forcedFormat,
              scoringFamily,
              pointsEnabled,
            );
        validateEventMode(forcedFormat, scoringFamily);
        const { normalizedEventData, createdLeagueTeams } = await createEventTeamsAndRemapFlights(
          tx,
          leagueId,
          {
            ...eventData,
            format: forcedFormat,
            scoringMode: scoring.scoringMode,
            scoringConfig: scoring.scoringConfig,
            pointsEnabled,
            strokePoints: normalizedStrokePoints,
          },
          league,
        );

        const { flights, ...e } = normalizedEventData;
        const startsAt = localEventTimeToUtc(e.date, e.startTime, timeZone);
        const leagueForFlights =
          createdLeagueTeams.length > 0 ? { ...league, teams: createdLeagueTeams } : league;
        validateTeeForEventParticipants(
          roundConfig,
          normalizedEventData,
          leagueForFlights,
          forcedFormat,
        );

        const created = await tx.event.create({
          data: {
            leagueId: leagueId,
            status: 'upcoming',
            courseId: Number(e.courseId),
            teeId: Number(e.teeId),
            name: String(e.name).trim(),
            startsAt,
            timeZone,
            startSide: roundConfig.startSide,
            interval: Number(e.interval),
            format: forcedFormat,
            scoringMode: scoring.scoringMode,
            scoringConfig: scoring.scoringConfig,
            routeSnapshot: buildEventRouteSnapshot(roundConfig.routeSegments),
            pointsEnabled,
            ptsPerHole: normalizeEventPointValue(e.ptsPerHole, 'Points per hole'),
            ptsPerMatch: normalizeEventPointValue(e.ptsPerMatch, 'Points per match'),
            ptsPerTeamWin: normalizeEventPointValue(e.ptsPerTeamWin, 'Points per team win'),
            strokePoints: normalizedStrokePoints,
            type: String(e.type).trim(),
            holes: roundConfig.holes,
            routeSegments: {
              create: roundConfig.routeSegments.map((segment, position) => ({
                courseId: segment.courseId,
                teeId: segment.teeId,
                position,
              })),
            },
            ...(createdLeagueTeams.length > 0
              ? {
                  teams: {
                    connect: createdLeagueTeams.map((team: any) => ({ id: team.id })),
                  },
                }
              : {}),
          },
        });

        const flightGen = new FlightGen(
          leagueForFlights,
          {
            ...normalizedEventData,
            startsAt,
            holes: roundConfig.holes,
            startSide: roundConfig.startSide,
          },
          created.id,
          tx,
        );
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
      const hasScoringPeriodsPayload = Object.prototype.hasOwnProperty.call(
        req.body,
        'scoringPeriods',
      );

      if (!Array.isArray(eventsData) || eventsData.length === 0) {
        throw new Error('At least one event is required.');
      }

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

      if (normalizeLeagueHoleFormat(league.holeFormat) === 'mixed') {
        throw new Error(
          'Invalid schedule generation: mixed 9/18-hole leagues require events to be created individually.',
        );
      }

      const scoringPeriods = hasScoringPeriodsPayload
        ? normalizeLeagueScoringPeriods(req.body.scoringPeriods, league)
        : [];

      if (scoringPeriods.length > 0) {
        const uncoveredEvent = eventsData.find((eventData: any) => {
          const eventDate = scoringPeriodDateKey(eventData?.date);
          return !scoringPeriods.some(
            (period) =>
              eventDate >= scoringPeriodDateKey(period.startDate) &&
              eventDate <= scoringPeriodDateKey(period.endDate),
          );
        });
        if (uncoveredEvent) {
          throw new Error('Every generated event must fall within a scoring period.');
        }
      }

      if (hasScoringPeriodsPayload) {
        const [existingPeriods, scoredRoundCount] = await Promise.all([
          prisma.league_scoring_period.findMany({
            where: { leagueId },
            orderBy: { position: 'asc' },
          }),
          prisma.round.count({
            where: {
              deletedAt: null,
              scores: { some: {} },
              event: { leagueId, deletedAt: null },
            },
          }),
        ]);
        const existingKey = existingPeriods
          .map(
            (period) =>
              `${period.name}|${scoringPeriodDateKey(period.startDate)}|${scoringPeriodDateKey(period.endDate)}`,
          )
          .join('::');
        const requestedKey = scoringPeriods
          .map(
            (period) =>
              `${period.name}|${scoringPeriodDateKey(period.startDate)}|${scoringPeriodDateKey(period.endDate)}`,
          )
          .join('::');
        if (scoredRoundCount > 0 && existingKey !== requestedKey) {
          throw new Error('Scoring period dates cannot change after scores have been recorded.');
        }
      }

      for (const eventData of eventsData) {
        validateEventDateWithinLeague(eventData?.date, league);
        validateEventHoleCount(eventData?.holes);
        validateEditableEventDetails(eventData);
      }

      const createdEvents = await prisma.$transaction(async (tx: any) => {
        if (hasScoringPeriodsPayload) {
          await tx.league_scoring_period.deleteMany({ where: { leagueId } });
          if (scoringPeriods.length > 0) {
            await tx.league_scoring_period.createMany({
              data: scoringPeriods.map((period) => ({ ...period, leagueId })),
            });
          }
        }

        const createdEventsInTransaction = [];
        for (const eventData of eventsData) {
          const eventHoles = validateEventHoleCount(eventData?.holes);
          const roundConfig = await validateCourseAndTee(
            tx,
            eventData?.courseId,
            eventData?.teeId,
            eventHoles,
            eventData?.startSide,
            eventData?.secondCourseId,
            eventData?.secondTeeId,
            eventData?.repeatFirstNine,
          );
          validateEventHolesForLeague(
            league.holeFormat,
            roundConfig.holes,
            roundConfig.courseHoles,
          );
          const timeZone = roundConfig.timeZone;
          const forcedFormat = resolveEventFormatForLeague(league, eventData?.format);
          const scoring = resolveEventScoring({
            format: forcedFormat,
            scoringMode: eventData?.scoringMode,
            scoringConfig: eventData?.scoringConfig,
          });
          const scoringFamily = scoring.scoringFamily;
          const pointsEnabled = eventData?.pointsEnabled !== false;
          validateTeeForEventParticipants(roundConfig, eventData, league, forcedFormat);
          const normalizedStrokePoints = scoring.scoringMode === 'stableford'
            ? null
            : normalizeStrokePoints(
                eventData?.strokePoints,
                forcedFormat,
                scoringFamily,
                pointsEnabled,
              );
          validateEventMode(forcedFormat, scoringFamily);
          const { flights: _flights, ...e } = {
            ...eventData,
            format: forcedFormat,
            scoringMode: scoring.scoringMode,
            scoringConfig: scoring.scoringConfig,
            pointsEnabled,
            strokePoints: normalizedStrokePoints,
          };
          const startsAt = localEventTimeToUtc(e.date, e.startTime, timeZone);

          const createdEvent = await tx.event.create({
            data: {
              leagueId: leagueId,
              status: 'upcoming',
              courseId: Number(e.courseId),
              teeId: Number(e.teeId),
              name: String(e.name).trim(),
              startsAt,
              timeZone,
              startSide: roundConfig.startSide,
              interval: Number(e.interval),
              format: forcedFormat,
              scoringMode: scoring.scoringMode,
              scoringConfig: scoring.scoringConfig,
              routeSnapshot: buildEventRouteSnapshot(roundConfig.routeSegments),
              pointsEnabled,
              ptsPerHole: normalizeEventPointValue(e.ptsPerHole, 'Points per hole'),
              ptsPerMatch: normalizeEventPointValue(e.ptsPerMatch, 'Points per match'),
              ptsPerTeamWin: normalizeEventPointValue(e.ptsPerTeamWin, 'Points per team win'),
              strokePoints: normalizedStrokePoints,
              type: String(e.type).trim(),
              holes: roundConfig.holes,
              routeSegments: {
                create: roundConfig.routeSegments.map((segment, position) => ({
                  courseId: segment.courseId,
                  teeId: segment.teeId,
                  position,
                })),
              },
            },
          });

          const flightGen = new FlightGen(
            league,
            {
              ...eventData,
              startsAt,
              holes: roundConfig.holes,
              startSide: roundConfig.startSide,
              format: forcedFormat,
            },
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
        select: { startDate: true, endDate: true, holeFormat: true },
      });
      if (!eventLeague) {
        return res.status(404).json({ message: 'League not found' });
      }
      validateEventDateWithinLeague(eventData?.date, eventLeague);
      const eventHoles = validateEventHoleCount(eventData?.holes);
      validateEditableEventDetails(eventData);

      const existingEvent = await prisma.event.findFirst({
        where: { id: eventId, leagueId, deletedAt: null },
        select: {
          id: true,
          status: true,
          scoringMode: true,
          scoringConfig: true,
          _count: { select: { rounds: true, teamRounds: true } },
        },
      });

      if (!existingEvent) {
        res.status(404).send('Event not found');
        return;
      }

      const isCompletedEvent =
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
      if (existingEvent._count.rounds > 0 || existingEvent._count.teamRounds > 0) {
        res.status(409).json({ message: 'Events with scores cannot have their setup edited' });
        return;
      }

      // have to delete and recreate flights to update players/teams in flights, which is the main reason for using a transaction here
      await prisma.$transaction(async (tx: any) => {
        await lockScoringEvent(tx, leagueId, eventId, false);
        const scored = await tx.event.findUnique({
          where: { id: eventId }, select: { _count: { select: { rounds: true, teamRounds: true } } },
        });
        if (scored?._count.rounds || scored?._count.teamRounds) throw new Error('Event setup cannot be edited after scoring');

        const roundConfig = await validateCourseAndTee(
          tx,
          eventData?.courseId,
          eventData?.teeId,
          eventHoles,
          eventData?.startSide,
          eventData?.secondCourseId,
          eventData?.secondTeeId,
          eventData?.repeatFirstNine,
        );
        validateEventHolesForLeague(
          eventLeague.holeFormat,
          roundConfig.holes,
          roundConfig.courseHoles,
        );
        const timeZone = roundConfig.timeZone;
        eventData.holes = roundConfig.holes;
        eventData.startSide = roundConfig.startSide;
        const startsAt = localEventTimeToUtc(eventData.date, eventData.startTime, timeZone);

        const existingFlights = await tx.flight.findMany({
          where: { eventId },
          select: {
            id: true,
            teams: {
              include: {
                team: {
                  include: {
                    players: {
                      where: { deletedAt: null },
                      select: { id: true },
                    },
                  },
                },
              },
            },
          },
        });
        const existingFlightTeams = existingFlights.flatMap((flight: any) => flight.teams);
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
        if (forcedFormat === 'team') {
          eventData.flights = normalizeEventFlightTeamIds(
            eventData.flights,
            existingFlightTeams,
            eventData.teams,
          );
        }
        const flightIds = existingFlights.map((flight: any) => flight.id);
        await tx.flight_player.deleteMany({
          where: { flightId: { in: flightIds } },
        });
        await tx.flight_team.deleteMany({
          where: { flightId: { in: flightIds } },
        });
        await tx.flight.deleteMany({ where: { eventId } });

        const scoring = resolveEventScoring({
          format: forcedFormat,
          scoringMode: eventData?.scoringMode ?? existingEvent.scoringMode,
          scoringConfig: eventData?.scoringConfig ?? existingEvent.scoringConfig,
        });
        const scoringFamily = scoring.scoringFamily;
        const pointsEnabled = eventData?.pointsEnabled !== false;
        validateTeeForEventParticipants(roundConfig, eventData, league, forcedFormat);
        const normalizedStrokePoints = scoring.scoringMode === 'stableford'
          ? null
          : normalizeStrokePoints(
              eventData?.strokePoints,
              forcedFormat,
              scoringFamily,
              pointsEnabled,
            );
        validateEventMode(forcedFormat, scoringFamily);
        eventData.format = forcedFormat;
        eventData.scoringMode = scoring.scoringMode;
        eventData.scoringConfig = scoring.scoringConfig;
        eventData.pointsEnabled = pointsEnabled;
        eventData.strokePoints = normalizedStrokePoints;

        await tx.event.update({
          where: { id: eventId },
          data: {
            courseId: Number(eventData.courseId),
            teeId: Number(eventData.teeId),
            name: String(eventData.name).trim(),
            startsAt,
            timeZone,
            type: String(eventData.type).trim(),
            holes: roundConfig.holes,
            startSide: roundConfig.startSide,
            interval: Number(eventData.interval),
            format: forcedFormat,
            scoringMode: scoring.scoringMode,
            scoringConfig: scoring.scoringConfig,
            routeSnapshot: buildEventRouteSnapshot(roundConfig.routeSegments),
            pointsEnabled,
            ptsPerHole: normalizeEventPointValue(eventData.ptsPerHole, 'Points per hole'),
            ptsPerMatch: normalizeEventPointValue(eventData.ptsPerMatch, 'Points per match'),
            ptsPerTeamWin: normalizeEventPointValue(eventData.ptsPerTeamWin, 'Points per team win'),
            strokePoints: normalizedStrokePoints,
          },
        });
        await tx.event_route_segment.deleteMany({ where: { eventId } });
        await tx.event_route_segment.createMany({
          data: roundConfig.routeSegments.map((segment, position) => ({
            eventId,
            courseId: segment.courseId,
            teeId: segment.teeId,
            position,
          })),
        });

        const resolvedTeams =
          forcedFormat === 'team'
            ? await resolveEventFlightTeams(tx, leagueId, eventId, eventData.flights)
            : league.teams;
        const teamsForFlights = Array.from(
          new Map(
            [
              ...resolvedTeams,
              ...existingFlightTeams
                .map((entry: any) => entry.team)
                .filter(Boolean),
            ].map((team: any) => [Number(team.id), team]),
          ).values(),
        );
        const flightGen = new FlightGen(
          { ...league, teams: teamsForFlights },
          { ...eventData, startsAt },
          eventId,
          tx,
        );
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

      const result = await removeUnscoredEvent(leagueId, eventId, 'cancel');
      if (result.status !== 200) return res.status(result.status).json({ message: result.message });
      const event = result.event;

      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId,
        entity: 'event',
        entityId: eventId,
        action: 'cancel',
        summary: `Canceled event ${event.name || eventId}.`,
      });

      res.status(200).send(event);
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

      const result = await removeUnscoredEvent(leagueId, eventId, 'delete');
      if (result.status !== 200) return res.status(result.status).json({ message: result.message });
      const event = result.event;

      await writeAuditLog({
        userId: req.session.userId ?? null,
        leagueId,
        entity: 'event',
        entityId: eventId,
        action: 'delete',
        summary: `Deleted event ${event.name || eventId}.`,
      });

      res.status(200).send(event);
    } catch (error) {
      console.error(error);
      const { status, message } = getPublicErrorResponse(error);
      res.status(status).json({ message });
    }
  };
}

export default EventController;

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

const validateEditableEventDetails = (eventData: any) => {
  if (!String(eventData?.name || '').trim()) {
    throw new Error('Event name is required.');
  }

  const interval = Number(eventData?.interval);
  if (!Number.isInteger(interval) || interval < 1 || interval > 180) {
    throw new Error('Event interval must be a whole number from 1 to 180 minutes.');
  }

  if (!String(eventData?.type || '').trim()) {
    throw new Error('Event type is required.');
  }
};

const normalizeEventPointValue = (raw: unknown, label: string) => {
  if (raw == null || raw === '') return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole number of 0 or higher.`);
  }
  return value;
};

const validateCourseAndTee = async (
  db: any,
  rawCourseId: unknown,
  rawTeeId: unknown,
  rawHoles: unknown,
  rawStartSide: unknown,
  rawSecondCourseId?: unknown,
  rawSecondTeeId?: unknown,
  rawRepeatFirstNine?: unknown,
) => {
  const courseId = Number(rawCourseId);
  const teeId = Number(rawTeeId);
  if (!Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(teeId) || teeId <= 0) {
    throw new Error('A valid course and tee are required.');
  }

  const loadTee = (selectedCourseId: number, selectedTeeId: number) => db.tee.findFirst({
    where: {
      id: selectedTeeId,
      courseId: selectedCourseId,
      deletedAt: null,
      course: { deletedAt: null },
    },
    select: {
      id: true,
      name: true,
      color: true,
      distance: true,
      par: true,
      frontPar: true,
      backPar: true,
      holes: true,
      holesWomen: true,
      slopeMen: true,
      slopeFrontMen: true,
      slopeBackMen: true,
      slopeWomen: true,
      slopeFrontWomen: true,
      slopeBackWomen: true,
      ratingMen: true,
      ratingFrontMen: true,
      ratingBackMen: true,
      ratingWomen: true,
      ratingFrontWomen: true,
      ratingBackWomen: true,
      course: {
        select: {
          id: true,
          name: true,
          clubId: true,
          timeZone: true,
          numHoles: true,
        },
      },
    },
  });
  const tee = await loadTee(courseId, teeId);

  if (!tee) {
    throw new Error('Selected tee does not belong to the selected course.');
  }

  const selection = selectRoundHoles(tee, tee.course.numHoles, rawHoles, rawStartSide);
  const secondCourseId = Number(rawSecondCourseId);
  const secondTeeId = Number(rawSecondTeeId);
  const hasSecondCourse = Number.isInteger(secondCourseId) && secondCourseId > 0;
  const hasSecondTee = Number.isInteger(secondTeeId) && secondTeeId > 0;
  if (hasSecondCourse !== hasSecondTee) {
    throw new Error('Select both a course and tee for the second nine.');
  }

  const primarySegment = {
    courseId,
    teeId,
    position: 0,
    course: tee.course,
    tee,
  };
  const routeSegments = [primarySegment];
  if (hasSecondCourse && hasSecondTee) {
    if (selection.holesPlayed !== 18 || !selection.isNineHoleCourse) {
      throw new Error('A second course can only be selected for an 18-hole route that starts on a 9-hole course.');
    }
    const secondTee = await loadTee(secondCourseId, secondTeeId);
    if (!secondTee) throw new Error('The second tee does not belong to the selected course.');
    if (getCourseHoleCount(secondTee.course.numHoles, secondTee) > 9) {
      throw new Error('The second route segment must be an independently playable 9-hole course.');
    }
    if (Number(secondTee.course.clubId) !== Number(tee.course.clubId)) {
      throw new Error('Both nines in an event route must belong to the same club.');
    }
    routeSegments.push({
      courseId: secondCourseId,
      teeId: secondTeeId,
      position: 1,
      course: secondTee.course,
      tee: secondTee,
    });
  } else if (selection.holesPlayed === 18 && selection.isNineHoleCourse) {
    if (rawRepeatFirstNine === false) {
      throw new Error('Select a course and tee for the second nine.');
    }
    routeSegments.push({ ...primarySegment, position: 1 });
  }

  return {
    timeZone: normalizeTimeZone(tee.course.timeZone),
    holes: selection.holesPlayed,
    startSide: selection.side,
    tee,
    courseHoles: selection.isNineHoleCourse ? 9 : 18,
    routeSegments,
  };
};

const getEventParticipantGenders = (eventData: any, league: any, format: string) => {
  const playersById = new Map<number, any>(
    (league.players || []).map((player: any) => [Number(player.id), player]),
  );
  const playerIds = new Set<number>();

  if (format === 'team') {
    const teamsById = new Map<number, any>(
      (league.teams || []).map((team: any) => [Number(team.id), team]),
    );
    for (const flight of eventData.flights || []) {
      for (const value of Array.isArray(flight) ? flight : []) {
        const team = teamsById.get(Number(extractTeamId(value)));
        for (const player of team?.players || []) playerIds.add(Number(player.id));
      }
    }
  } else {
    const visit = (value: any) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      const id = Number(
        value && typeof value === 'object'
          ? value.playerId ?? value.player?.id ?? value.id
          : value,
      );
      if (Number.isInteger(id) && id > 0) playerIds.add(id);
    };
    visit(eventData.flights || []);
  }

  return [...new Set(
    [...playerIds]
      .map((playerId) => playersById.get(playerId)?.gender)
      .filter(Boolean),
  )];
};

const validateTeeForEventParticipants = (
  roundConfig: Awaited<ReturnType<typeof validateCourseAndTee>>,
  eventData: any,
  league: any,
  format: string,
) => {
  for (const gender of getEventParticipantGenders(eventData, league, format)) {
    modelEventTeeForRound(
      {
        holes: roundConfig.holes,
        startSide: roundConfig.startSide,
        routeSegments: roundConfig.routeSegments,
      },
      gender,
    );
  }
};

const getHistoricalEventHandicaps = async (event: any) => {
  const playerIds = (event.flights || []).flatMap((flight: any) =>
    (flight.players || []).map((entry: any) => Number(entry.playerId)),
  );
  const priorRounds = await prisma.round.findMany({
    where: {
      playerId: { in: playerIds },
      status: 'completed',
      deletedAt: null,
      event: {
        leagueId: Number(event.leagueId),
        startsAt: { lt: event.startsAt },
        deletedAt: null,
      },
    },
    select: { playerId: true, postHandicap: true, event: { select: { startsAt: true } } },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
  });
  const handicaps = new Map<number, number>();
  const dates = new Map<number, number>();
  for (const round of priorRounds) {
    const handicap = Number(round.postHandicap);
    if (round.postHandicap != null && !handicaps.has(round.playerId) && Number.isFinite(handicap)) {
      handicaps.set(round.playerId, handicap);
      dates.set(round.playerId, round.event.startsAt.getTime());
    }
  }
  const adjustments = await prisma.player_handicap_adjustment.findMany({
    where: { playerId: { in: playerIds }, effectiveAt: { lte: event.startsAt } },
    orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
  });
  for (const adjustment of adjustments) {
    if (adjustment.effectiveAt.getTime() >= (dates.get(adjustment.playerId) ?? -Infinity)) {
      handicaps.set(adjustment.playerId, adjustment.handicap);
      dates.set(adjustment.playerId, adjustment.effectiveAt.getTime());
    }
  }
  return handicaps;
};

const addEventRoundSetup = (event: any, historicalHandicaps = new Map<number, number>()) => {
  const maleSelection = selectEventRouteHoles(event, 'male');
  const womenSelection = selectEventRouteHoles(event, 'female');
  const sharedSnapshotHandicaps = new Map<number, number>();
  for (const teamRound of event.teamRounds || []) {
    const snapshot = teamRound?.handicapSnapshot;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) continue;
    const players = (snapshot as Record<string, unknown>).players;
    if (!Array.isArray(players)) continue;
    for (const player of players) {
      if (!player || typeof player !== 'object' || Array.isArray(player)) continue;
      const source = player as Record<string, unknown>;
      const playerId = Number(source.playerId);
      const handicap = Number(source.playerHandicap);
      if (Number.isInteger(playerId) && Number.isFinite(handicap)) {
        sharedSnapshotHandicaps.set(playerId, handicap);
      }
    }
  }

  return {
    ...event,
    scoringHoles: maleSelection.holes,
    scoringHolesByGender: {
      male: maleSelection.holes,
      female: womenSelection.holes,
    },
    startSide: maleSelection.side,
    flights: (event.flights || []).map((flight: any) => ({
      ...flight,
      players: (flight.players || []).map((entry: any) => {
        const player = entry.player;
        const existingRound = player?.rounds?.[0];
        const handicapIndex = Number(
          existingRound?.preHandicap ??
            sharedSnapshotHandicaps.get(Number(entry.playerId)) ??
            historicalHandicaps.get(Number(entry.playerId)) ??
            player?.startingHandicap ??
            player?.handicap,
        );
        return {
          ...entry,
          handicapIndex,
        };
      }),
    })),
  };
};

const normalizeStrokePoints = (
  raw: unknown,
  format: string,
  scoringFamily: string,
  pointsEnabled = true,
) => {
  const normalizedFormat = String(format || '').toLowerCase();
  if (!pointsEnabled) return null;
  if (!['individual', 'team'].includes(normalizedFormat)) return null;
  if (String(scoringFamily || '').toLowerCase() !== 'stroke') return null;

  if (Array.isArray(raw)) {
    const arr = raw
      .filter((value) => value != null && String(value).trim() !== '')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0);
    return arr.length > 0 ? arr : null;
  }

  if (typeof raw === 'string') {
    const arr = raw
      .split(',')
      .filter((value) => value.trim() !== '')
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
