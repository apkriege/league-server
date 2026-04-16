import { Request, Response } from 'express';
import EventService from '../models/event';
import LeagueService from '../models/league';
import { prisma } from '../../prisma';

import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { Scoring } from '../services/scoring';
dayjs.extend(customParseFormat);

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

const normalizeIds = (ids: any[] = []) =>
  ids
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => a - b);

const extractTeamId = (value: any): number | null => {
  if (Number.isFinite(Number(value))) {
    return Number(value);
  }

  if (value && typeof value === 'object') {
    const raw = value.id ?? value.teamId ?? value.team?.id ?? value.team?.teamId;
    if (Number.isFinite(Number(raw))) {
      return Number(raw);
    }
  }

  return null;
};

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

  if (eventData?.format !== 'team' || eventData?.scoringFormat !== 'match') {
    return {
      normalizedEventData: eventData,
      createdLeagueTeams: [],
    };
  }

  const incomingTeams = Array.isArray(eventData?.teams) ? eventData.teams : [];
  const incomingFlights = Array.isArray(eventData?.flights) ? eventData.flights : [];

  if (incomingTeams.length === 0) {
    throw new Error('Team match events require teams in the payload.');
  }

  const tempToLeagueTeamId = new Map<string, number>();
  const createdLeagueTeams: any[] = [];

  for (const incomingTeam of incomingTeams) {
    const incomingTeamId = extractTeamId(incomingTeam);
    if (incomingTeamId === null) {
      throw new Error('Team match events require a numeric team id for each team.');
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
    return String(league.format).toLowerCase();
  }

  return String(incomingFormat || '').toLowerCase();
};

class FlightGen {
  constructor(
    private league: any,
    private event: any,
    private eventId: number,
    private prismaClient: any = prisma,
  ) {
    this.league = league;
    this.event = event;
    this.eventId = eventId;
  }

  saveFlights() {
    if (this.event.format === 'individual' && this.event.scoringFormat === 'stroke') {
      return this.individualStroke();
    } else if (this.event.format === 'individual' && this.event.scoringFormat === 'match') {
      return this.individualMatch();
    } else if (this.event.format === 'team' && this.event.scoringFormat === 'match') {
      return this.teamMatch();
    } else {
      throw new Error('Unsupported league or event type for flight generation');
    }
  }

  // individual stroke play
  // [1, 2, 3, 4], [5, 6, 7, 8]
  async individualStroke() {
    const players = this.league.players;

    for (const i in this.event.flights) {
      const f = this.event.flights[i];
      const playerIds = f.map((p: any) => Number(p));

      const startTime = dayjs(this.event.startTime, 'H:mm')
        .add(Number(i) * Number(this.event.interval), 'minute')
        .format('H:mm');

      await this.prismaClient.flight.create({
        data: {
          eventId: this.eventId,
          startTime: startTime,
          players: {
            create: playerIds.map((playerId: number) => ({
              playerId,
            })),
          },
        },
      });
    }

    // implement flight generation logic for individual stroke play
  }

  // individual match play,
  // [[1, 2], [3, 4]], [[5, 6], [7, 8]], [[9, 10], [11, 12]]
  individualMatch() {
    const players = this.league.players;

    for (const i in this.event.flights) {
      const f = this.event.flights[i];
      const p1Id = Number(f[0]);
      const p2Id = Number(f[1]);

      const startTime = dayjs(this.event.startTime, 'H:mm')
        .add(Number(i) * Number(this.event.interval), 'minute')
        .format('H:mm');

      this.prismaClient.flight.create({
        data: {
          eventId: this.eventId,
          startTime: startTime,
          players: {
            create: [{ playerId: p1Id }, { playerId: p2Id }],
          },
        },
      });
    }
  }

  // team match play
  // [1, 2],
  // [3, 4],
  // [5, 6],
  async teamMatch() {
    const teams = this.league.teams;

    for (const i in this.event.flights) {
      const f = this.event.flights[i];
      const t1Id = extractTeamId(f[0]);
      const t2Id = extractTeamId(f[1]);

      if (t1Id === null || t2Id === null) {
        throw new Error(`Invalid team matchup at flight index ${i}.`);
      }

      const team1 = teams.find((t: any) => Number(t.id) === t1Id);
      const team2 = teams.find((t: any) => Number(t.id) === t2Id);

      if (!team1 || !team2) {
        throw new Error(`Unable to resolve team IDs for flight index ${i}.`);
      }

      const team1Id = Number(team1.id);
      const team2Id = Number(team2.id);

      // for match play only take 2 players from each team, for stroke play take all players on the team
      const team1PlayerIds = team1.players.map((p: any) => p.id).slice(0, 2);
      const team2PlayerIds = team2.players.map((p: any) => p.id).slice(0, 2);

      const startTime = dayjs(this.event.startTime, 'H:mm')
        .add(Number(i) * Number(this.event.interval), 'minute')
        .format('H:mm');

      await this.prismaClient.flight.create({
        data: {
          eventId: this.eventId,
          startTime: startTime,
          teams: {
            create: [
              {
                teamId: team1Id,
              },
              {
                teamId: team2Id,
              },
            ],
          },
          players: {
            create: [
              ...team1PlayerIds.map((playerId: number) => ({
                teamId: team1Id,
                playerId,
              })),
              ...team2PlayerIds.map((playerId: number) => ({
                teamId: team2Id,
                playerId,
              })),
            ],
          },
        },
      });
    }
  }

  async teamWizard() {
    const teams = this.league.teams;

    for (const i in this.event.flights) {
      const f = this.event.flights[i];
      const t1Id = extractTeamId(f[0]);
      const t2Id = extractTeamId(f[1]);

      if (t1Id === null || t2Id === null) {
        throw new Error(`Invalid team matchup at flight index ${i}.`);
      }

      const team1 = teams.find((t: any) => Number(t.id) === t1Id);
      const team2 = teams.find((t: any) => Number(t.id) === t2Id);

      if (!team1 || !team2) {
        throw new Error(`Unable to resolve team IDs for flight index ${i}.`);
      }

      const team1Id = Number(team1.id);
      const team2Id = Number(team2.id);

      const team1PlayerIds = team1.players.map((p: any) => p.id).slice(0, 2);
      const team2PlayerIds = team2.players.map((p: any) => p.id).slice(0, 2);

      const startTime = dayjs(this.event.startTime, 'H:mm')
        .add(Number(i) * Number(this.event.interval), 'minute')
        .format('H:mm');

      await this.prismaClient.flight.create({
        data: {
          eventId: this.eventId,
          startTime: startTime,
          teams: {
            create: [
              {
                teamId: team1Id,
              },
              {
                teamId: team2Id,
              },
            ],
          },
          players: {
            create: [
              ...team1PlayerIds.map((playerId: number) => ({
                teamId: team1Id,
                playerId,
              })),
              ...team2PlayerIds.map((playerId: number) => ({
                teamId: team2Id,
                playerId,
              })),
            ],
          },
        },
      });
    }
  }
}

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

      res.status(200).send(events);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getLeagueEvent = async (req: Request, res: Response) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const eventId = Number(req.params.eventId);

      const event = await prisma.event.findFirst({
        where: { id: eventId, isDeleted: false },
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

      res.status(200).send(event);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

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
        where: { id: eventId, isDeleted: false },
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

  static createEvent = async (req: Request, res: Response) => {
    try {
      console.log('Received event creation request with data:', req.body);

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
        const { normalizedEventData, createdLeagueTeams } = await createEventTeamsAndRemapFlights(
          tx,
          leagueId,
          {
            ...eventData,
            format: forcedFormat,
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
            scoringFormat: e.scoringFormat,
            ptsPerHole: Number(e.ptsPerHole),
            ptsPerMatch: Number(e.ptsPerMatch),
            ptsPerTeamWin: Number(e.ptsPerTeamWin),
            strokePoints: e.strokePoints,
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
        const { flights, ...e } = {
          ...eventData,
          format: forcedFormat,
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
              scoringFormat: e.scoringFormat,
              ptsPerHole: Number(e.ptsPerHole),
              ptsPerMatch: Number(e.ptsPerMatch),
              ptsPerTeamWin: Number(e.ptsPerTeamWin),
              strokePoints: e.strokePoints,
              type: e.type,
              holes: e.holes,
            },
          });

          const flightGen = new FlightGen(
            league,
            { ...eventData, format: forcedFormat },
            created.id,
            tx,
          );
          await flightGen.teamWizard();

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

  static updateEvent = async (req: Request, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      const eventData = req.body;
      delete eventData.id; // Ensure ID is not included in the update data

      console.log('Updating event with data:', eventData);

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
            format: eventData.format,
            scoringFormat: eventData.scoringFormat,
            ptsPerHole: Number(eventData.ptsPerHole),
            ptsPerMatch: Number(eventData.ptsPerMatch),
            ptsPerTeamWin: Number(eventData.ptsPerTeamWin),
            strokePoints: eventData.strokePoints,
          },
        });

        const league = await LeagueService.query().findFirst({
          where: { id: eventData.leagueId },
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
        eventData.format = forcedFormat;

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

  static runEventScoring = async (req: Request, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);

      if (!eventId) {
        res.status(400).json({ message: 'Invalid event ID' });
        return;
      }

      const scoring = new Scoring(eventId);
      await scoring.run();
      res.status(200).json({ message: 'Scoring process completed', scoring });
    } catch (error) {
      console.error('Error running scoring process:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export default EventController;
