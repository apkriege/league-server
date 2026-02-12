import { Request, Response } from 'express';
import EventService from '../models/event';
import LeagueService from '../models/league';
import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { Scoring } from '../services/scoring';
dayjs.extend(customParseFormat);

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
    if (this.event.eventFormat === 'individual' && this.event.scoringFormat === 'stroke') {
      return this.individualStroke();
    } else if (this.event.eventFormat === 'individual' && this.event.scoringFormat === 'match') {
      return this.individualMatch();
    } else if (this.event.eventFormat === 'team' && this.event.scoringFormat === 'match') {
      return this.teamMatch();
    } else {
      throw new Error('Unsupported league or event type for flight generation');
    }
  }

  // individual stroke play
  // [1, 2, 3, 4], [5, 6, 7, 8]
  individualStroke() {
    const players = this.league.players;
    // implement flight generation logic for individual stroke play
  }

  // individual match play,
  // [[1, 2], [3, 4]], [[5, 6], [7, 8]], [[9, 10], [11, 12]]
  individualMatch() {
    const players = this.league.players;
  }

  // team match play
  // [1, 2],
  // [3, 4],
  // [5, 6],
  async teamMatch() {
    const teams = this.league.teams;

    for (const i in this.event.flights) {
      const f = this.event.flights[i];
      const t1Id = Number(f[0]);
      const t2Id = Number(f[1]);

      const team1 = teams.find((t: any) => t.id === t1Id);
      const team2 = teams.find((t: any) => t.id === t2Id);

      const team1PlayerIds = team1.players.map((p: any) => p.id);
      const team2PlayerIds = team2.players.map((p: any) => p.id);

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
                teamId: t1Id,
              },
              {
                teamId: t2Id,
              },
            ],
          },
          players: {
            create: [
              ...team1PlayerIds.map((playerId: number) => ({
                playerId,
              })),
              ...team2PlayerIds.map((playerId: number) => ({
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
      const t1Id = Number(f[0].id);
      const t2Id = Number(f[1].id);

      const team1 = teams.find((t: any) => t.id === t1Id);
      const team2 = teams.find((t: any) => t.id === t2Id);

      const team1PlayerIds = team1.players.map((p: any) => p.id);
      const team2PlayerIds = team2.players.map((p: any) => p.id);

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
                teamId: t1Id,
              },
              {
                teamId: t2Id,
              },
            ],
          },
          players: {
            create: [
              ...team1PlayerIds.map((playerId: number) => ({
                playerId,
              })),
              ...team2PlayerIds.map((playerId: number) => ({
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
      const leagueId = parseInt(req.params.leagueId);

      const events = await prisma.event.findMany({
        where: { leagueId },
        include: {
          course: true,
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
      const leagueId = parseInt(req.params.leagueId);
      const eventId = parseInt(req.params.eventId);

      const event = await prisma.event.findFirst({
        where: { id: eventId },
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
      const leagueId = parseInt(req.params.leagueId);
      const eventId = parseInt(req.params.eventId);

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
        where: { id: eventId },
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
      const leagueId = parseInt(req.params.leagueId);
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

      const { flights, ...restEventData } = eventData;

      // Wrap both operations in a transaction for atomicity
      const newEvent = await prisma.$transaction(async (tx) => {
        const created = await tx.event.create({
          data: {
            leagueId: leagueId,
            status: 'scheduled',
            ...restEventData,
          },
        });

        const flightGen = new FlightGen(league, eventData, created.id, tx);
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
      const leagueId = parseInt(req.params.leagueId);
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

        const { flights, ...restEventData } = eventData;

        const newEvent = await prisma.$transaction(async (tx) => {
          const created = await tx.event.create({
            data: {
              leagueId: leagueId,
              status: 'scheduled',
              ...restEventData,
            },
          });

          const flightGen = new FlightGen(league, eventData, created.id, tx);
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
