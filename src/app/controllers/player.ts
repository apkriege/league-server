import { Request, Response } from 'express';
import PlayerService from '../models/player';
import { prisma } from '../../prisma';

export default class PlayerController {
  static getPlayer = async (req: Request, res: Response): Promise<any> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: 'Player ID is required' });
      }

      const player = await prisma.player.findUnique({
        where: { id: Number(id) },
        include: {
          rounds: {
            include: {
              event: {
                select: {
                  id: true,
                  name: true,
                  date: true,
                  startSide: true,
                },
              },
              scores: true,
              tee: true,
              course: true,
            },
          },
        },
      });

      if (!player) {
        return res.status(404).json({ message: 'Player not found' });
      }

      res.status(200).json(player);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getLeaguePlayers = async (req: Request, res: Response): Promise<any> => {
    try {
      const { leagueId } = req.params;

      if (!leagueId) {
        return res.status(400).json({ message: 'leagueId is required' });
      }

      const players = await PlayerService.findByLeagueId(Number(leagueId));

      res.status(200).send(players);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
