import { Request, Response } from 'express';
import PlayerService from '../services/player';

export default class PlayerController {
  static getLeaguePlayers = async (req: Request, res: Response): Promise<any> => {
    try {
      const { leagueId } = req.params;

      if (!leagueId) {
        return res.status(400).json({ message: 'leagueId is required' });
      }

      const players = await PlayerService.findByLeagueId(parseInt(leagueId));

      res.status(200).send(players);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
