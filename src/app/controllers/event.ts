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
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getEvents = async (req: Request, res: Response) => {
    try {
      const events = await EventService.findAll();
      res.status(200).send(events);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // GET LEAGUE EVENTS
  static getLeagueEvents = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);

      const events = await prisma.event.findMany({
        where: { leagueId, isDeleted: false },
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
        orderBy: { date: 'asc' },
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
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // GET LEAGUE EVENT DETAILS (INCLUDING FLIGHTS AND ROUNDS)
  static getLeagueEvent = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const eventId = Number(req.params.eventId);

      const event = await prisma.event.findFirst({
        where: { id: eventId, leagueId, isDeleted: false },
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
      res.status(500).json({ message: 'Internal server error' });
    }
  };


  // GET LEAGUE EVENT ROUNDS AND SCORES
  static getLeagueEventRounds = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const eventId = Number(req.params.eventId);

      const scores = await prisma.round.findMany({
        where: { eventId },
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
        where: { id: eventId, leagueId, isDeleted: false },
        include: {
          course: true,
          tee: true,
          flights: {
            where: { eventId },
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
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // CREATE EVENT
  static createEvent = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const eventData = req.body;
      const league = await LeagueService.query().findFirst({
        where: { id: leagueId },
        include: {
          players: true,
          teams: {
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

      const newEvent = await prisma.$transaction(async (tx: any) => {
        const forcedFormat = resolveEventFormatForLeague(league, eventData?.format);
        const normalizedScoringFormat = normalizeScoringFormat(eventData?.scoringFormat, 'stroke');
        const normalizedStrokePoints = normalizeStrokePoints(
          eventData?.strokePoints,
          forcedFormat,
          normalizedScoringFormat,
        );
        validateEventMode(forcedFormat, normalizedScoringFormat);
        const { normalizedEventData, createdLeagueTeams } = await createEventTeamsAndRemapFlights(
          tx,
          leagueId,
          {
            ...eventData,
            format: forcedFormat,
            scoringFormat: normalizedScoringFormat,
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
            ptsPerHole: Number(e.ptsPerHole),
            ptsPerMatch: Number(e.ptsPerMatch),
            ptsPerTeamWin: Number(e.ptsPerTeamWin),
            strokePoints: normalizeStrokePoints(
              e.strokePoints,
              forcedFormat,
              normalizedScoringFormat,
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

      res.status(201).send(newEvent);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // CREATE MULTIPLE EVENTS
  static createMultipleEvents = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const eventsData = req.body.events;

      const createdEvents = [];

      for (const eventData of eventsData) {
        const league = await LeagueService.query().findFirst({
          where: { id: leagueId },
          include: {
            players: true,
            teams: {
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

        const forcedFormat = resolveEventFormatForLeague(league, eventData?.format);
        const normalizedScoringFormat = normalizeScoringFormat(eventData?.scoringFormat, 'stroke');
        const normalizedStrokePoints = normalizeStrokePoints(
          eventData?.strokePoints,
          forcedFormat,
          normalizedScoringFormat,
        );
        validateEventMode(forcedFormat, normalizedScoringFormat);
        const { flights, ...e } = {
          ...eventData,
          format: forcedFormat,
          scoringFormat: normalizedScoringFormat,
          strokePoints: normalizedStrokePoints,
        };

        const newEvent = await prisma.$transaction(async (tx: any) => {
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
              ptsPerHole: Number(e.ptsPerHole),
              ptsPerMatch: Number(e.ptsPerMatch),
              ptsPerTeamWin: Number(e.ptsPerTeamWin),
              strokePoints: normalizeStrokePoints(
                e.strokePoints,
                forcedFormat,
                normalizedScoringFormat,
              ),
              type: e.type,
              holes: e.holes,
            },
          });

          const flightGen = new FlightGen(
            league,
            { ...eventData, format: forcedFormat, scoringFormat: normalizedScoringFormat },
            created.id,
            tx,
          );
          await flightGen.saveFlights();

          return created;
        });

        createdEvents.push(newEvent);
      }

      res.status(201).send(createdEvents);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // UPDATE EVENT
  static updateEvent = async (req: Request, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      const leagueId = Number(req.params.leagueId);
      const eventData = req.body;
      delete eventData.id;

      const existingEvent = await prisma.event.findFirst({
        where: { id: eventId, leagueId, isDeleted: false },
        select: { id: true, status: true, isComplete: true },
      });

      if (!existingEvent) {
        res.status(404).send('Event not found');
        return;
      }

      const isCompletedEvent =
        Boolean(existingEvent.isComplete) ||
        String(existingEvent.status || '').toLowerCase() === 'completed';

      if (isCompletedEvent) {
        res.status(409).json({ message: 'Completed events cannot be edited' });
        return;
      }

      // have to delete and recreate flights to update players/teams in flights, which is the main reason for using a transaction here
      await prisma.$transaction(async (tx: any) => {
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
          where: { id: leagueId },
          include: {
            players: true,
            teams: {
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
        const normalizedStrokePoints = normalizeStrokePoints(
          eventData?.strokePoints,
          forcedFormat,
          normalizedScoringFormat,
        );
        validateEventMode(forcedFormat, normalizedScoringFormat);
        eventData.format = forcedFormat;
        eventData.scoringFormat = normalizedScoringFormat;
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
            ptsPerHole: Number(eventData.ptsPerHole),
            ptsPerMatch: Number(eventData.ptsPerMatch),
            ptsPerTeamWin: Number(eventData.ptsPerTeamWin),
            strokePoints: normalizeStrokePoints(
              eventData.strokePoints,
              forcedFormat,
              normalizedScoringFormat,
            ),
          },
        });

        const flightGen = new FlightGen(league, eventData, eventId, tx);
        await flightGen.saveFlights();
      });

      const updatedEvent = await prisma.event.findUnique({ where: { id: eventId } });
      res.status(200).send(updatedEvent);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // DELETE (SOFT) EVENT
  static deleteEvent = async (req: Request, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);

      await prisma.event.update({
        where: { id: eventId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
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
      // Store as midnight UTC for date-only payloads.
      return new Date(`${trimmed}T00:00:00.000Z`);
    }

    const dt = new Date(trimmed);
    if (!Number.isNaN(dt.getTime())) {
      return dt;
    }
  }

  throw new Error('Invalid event date. Expected YYYY-MM-DD or ISO-8601 DateTime.');
};

const normalizeStrokePoints = (raw: unknown, format: string, scoringFormat: string) => {
  const normalizedFormat = String(format || '').toLowerCase();
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
