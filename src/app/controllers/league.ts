import { Request, Response } from 'express';
import LeagueService from '../models/league';
import { prisma } from '../../prisma';

const calculateLowNet = (scores: any[]) => {
  if (!scores || scores.length === 0) return null;

  const minScore = Math.min(...scores.map((score) => score.net));
  const playersWithMinScore = scores.filter((score) => score.net === minScore);

  return playersWithMinScore.map((score) => ({
    player: `${score.player.firstName} ${score.player.lastName}`,
    net: score.net,
  }));
};

const calculateLowGross = (scores: any[]) => {
  if (!scores || scores.length === 0) return null;

  const minGross = Math.min(...scores.map((score) => score.score));
  const playersWithMinGross = scores.filter((score) => score.score === minGross);

  return playersWithMinGross.map((score) => ({
    player: `${score.player.firstName} ${score.player.lastName}`,
    gross: score.score,
  }));
};

const calculateStats = (scores: any[]) => {
  const statNames = ['pointsEarned', 'eagles', 'birdies', 'pars', 'bogeys'];
  const test = {
    pointsEarned: { players: [], value: 0 },
    eagles: { players: [], value: 0 },
    birdies: { players: [], value: 0 },
    pars: { players: [], value: 0 },
    bogeys: { players: [], value: 0 },
  } as any;

  scores.forEach((score) => {
    const playerName = `${score.player.firstName} ${score.player.lastName}`;

    statNames.forEach((stat) => {
      const currentValue = score[stat];

      if (currentValue <= 0) return;

      const statRecord = test[stat];

      if (currentValue > statRecord.value) {
        statRecord.value = currentValue;
        statRecord.players = [playerName];
      } else if (currentValue === statRecord.value) {
        statRecord.players.push(playerName);
      }
    });
  });

  return test;
};

class LeagueController {
  static getLeagueInfo = async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.leagueId);
      const league = await LeagueService.findById(id);

      const lastEvent = await prisma.event.findFirst({
        where: { leagueId: id, isComplete: true },
        include: {
          rounds: {
            include: {
              player: true,
            },
          },
        },
        orderBy: { date: 'desc' },
      });

      const result = {
        league,
        lastEvent: {
          id: lastEvent?.id,
          name: lastEvent?.name,
          date: lastEvent?.date,
          course: lastEvent?.courseId,
          stats: calculateStats(lastEvent?.rounds || []),
          lowNet: calculateLowNet(lastEvent?.rounds || []),
          lowGross: calculateLowGross(lastEvent?.rounds || []),
        },
      };

      res.status(200).send(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getLeague = async (req: Request, res: Response) => {
    try {
      console.log(req.params);
      const id = parseInt(req.params.id);
      console.log('Fetching league with ID:', id);

      const league = await prisma.league.findUnique({
        where: { id },
        include: {
          players: true,
          teams: {
            include: {
              players: true,
            },
          },
        },
      });

      if (!league) {
        res.status(404).send('League not found');
        return;
      }

      res.status(200).send(league);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getAllLeagues = async (req: Request, res: Response) => {
    try {
      const leagues = await LeagueService.findAll();
      res.status(200).send(leagues);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getAdminLeagues = async (req: Request, res: Response) => {
    try {
      const leagues = await prisma.league.findMany({
        where: { adminId: req.session.userId },
        select: {
          id: true,
          name: true,
        },
      });
      res.status(200).send(leagues);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getAdminLeague = async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      const league = await prisma.league.findUnique({
        where: { id },
        include: {
          players: true,
          teams: {
            include: {
              players: true,
            },
          },
          events: {
            include: {
              course: true,
              flights: {
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
          },
        },
      });

      if (!league) {
        res.status(404).send('League not found');
        return;
      }

      res.status(200).send(league);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getLeagues = async (req: Request, res: Response) => {
    try {
      const userId: any = req.session.userId;
      const playerIds = await prisma.player.findMany({
        where: { userId },
        select: { id: true },
      });

      const leagues = await prisma.league.findMany({
        where: {
          OR: [
            { players: { some: { id: { in: playerIds.map((p) => p.id) } } } },
            {
              teams: {
                some: {
                  players: { some: { id: { in: playerIds.map((p) => p.id) } } },
                },
              },
            },
          ],
        },
      });

      const upcomingSchedule = await prisma.flight.findMany({
        where: {
          players: {
            some: {
              playerId: { in: playerIds.map((p) => p.id) },
            },
          },
        },
        include: {
          event: true,
        },
        orderBy: {
          event: {
            date: 'asc',
          },
        },
        take: 5,
      });

      res.status(200).send({ leagues, upcomingSchedule });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static createLeague = async (req: Request, res: Response) => {
    try {
      const { players, teams, ...leagueData } = req.body;

      const newLeague = await prisma.league.create({
        data: {
          ...leagueData,
        },
      });

      if (players && players.length > 0) {
        for (const player of players) {
          await prisma.player.create({
            data: {
              ...player,
              handicap: Number(player.handicap),
              seasonPoints: 0,
              leagueId: newLeague.id,
            },
          });
        }
      } else {
        console.error('No individual players to create');
      }

      if (teams && teams.length > 0) {
        for (const team of teams) {
          await prisma.team.create({
            data: {
              name: team.name,
              leagueId: newLeague.id,
              seasonPoints: 0,
              players: {
                create: team.players.map((player: any) => ({
                  ...player,
                  handicap: Number(player.handicap),
                  seasonPoints: 0,
                  leagueId: newLeague.id,
                })),
              },
            },
          });
        }
      } else {
        console.error('No teams to create');
      }

      res.status(201).send(newLeague);

      // res.status(201).send('League creation endpoint');
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static updateLeague = async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const league = req.body;
      const updatedLeague = await LeagueService.update(id, league);

      if (!updatedLeague) {
        res.status(404).send('League not found');
        return;
      }

      res.status(200).send(updatedLeague);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static deleteLeague = async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await LeagueService.delete(id);
      res.status(204).json('League deleted');
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export default LeagueController;
