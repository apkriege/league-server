import { Request, Response } from 'express';
import LeagueService from '../models/league';
import { prisma } from '../../prisma';

class LeagueController {
  static normalizeLeaguePayload = (payload: any) => {
    const normalizedType = String(payload?.type || '').toLowerCase();
    const normalizedFormat = payload?.format ? String(payload.format).toLowerCase() : null;

    if (normalizedType === 'season' && !['individual', 'team'].includes(normalizedFormat || '')) {
      throw new Error('Season leagues require format to be either "individual" or "team".');
    }

    return {
      ...payload,
      type: normalizedType,
      format: normalizedType === 'season' ? normalizedFormat : null,
    };
  };

  static getLeagueInfo = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.leagueId);
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
      const id = Number(req.params.id);

      const league = await prisma.league.findUnique({
        where: { id },
        include: {
          events: {
            include: {
              course: true,
              tee: true,
            },
          },
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
      const id = Number(req.params.id);

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
            { players: { some: { id: { in: playerIds.map((p: { id: number }) => p.id) } } } },
            {
              teams: {
                some: {
                  players: {
                    some: { id: { in: playerIds.map((p: { id: number }) => p.id) } },
                  },
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
              playerId: { in: playerIds.map((p: { id: number }) => p.id) },
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
      const { players = [], teams = [], ...leagueData } = req.body;
      const normalizedLeagueData = LeagueController.normalizeLeaguePayload(leagueData);

      const newLeague = await prisma.league.create({
        data: {
          ...normalizedLeagueData,
        },
      });

      if (players && players.length > 0) {
        const playerIdMap = new Map<number, number>();

        for (const player of players) {
          const createdPlayer = await prisma.player.create({
            data: {
              firstName: player.firstName,
              lastName: player.lastName,
              email: player.email,
              phone: player.phone,
              type: player.type,
              handicap: Number(player.handicap),
              seasonPoints: 0,
              leagueId: newLeague.id,
            },
          });

          if (player?.id !== undefined && player?.id !== null) {
            playerIdMap.set(Number(player.id), createdPlayer.id);
          }
        }

        if (normalizedLeagueData.type === 'season' && normalizedLeagueData.format === 'team') {
          for (const team of teams) {
            const createdTeam = await prisma.team.create({
              data: {
                name: team.name,
                leagueId: newLeague.id,
                seasonPoints: 0,
              },
            });

            const mappedPlayerIds = (team.players || [])
              .map((id: any) => playerIdMap.get(Number(id)))
              .filter(Boolean) as number[];

            if (mappedPlayerIds.length > 0) {
              await prisma.player.updateMany({
                where: {
                  leagueId: newLeague.id,
                  id: { in: mappedPlayerIds },
                },
                data: {
                  teamId: createdTeam.id,
                },
              });
            }
          }
        }
      }

      res.status(201).send(newLeague);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      const status = message.includes('Season leagues require format') ? 400 : 500;
      res.status(status).json({ message });
    }
  };

  static updateLeague = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const league = LeagueController.normalizeLeaguePayload(req.body);
      const updatedLeague = await LeagueService.update(id, league);

      if (!updatedLeague) {
        res.status(404).send('League not found');
        return;
      }

      res.status(200).send(updatedLeague);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      const status = message.includes('Season leagues require format') ? 400 : 500;
      res.status(status).json({ message });
    }
  };

  static deleteLeague = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await LeagueService.delete(id);
      res.status(204).json('League deleted');
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export default LeagueController;

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
