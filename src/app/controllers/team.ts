import { Request, Response } from 'express';
import TeamService from '../models/team';
import { prisma } from '../../prisma';

class TeamController {
  static getTeams = async (req: Request, res: Response) => {
    try {
      const teams = await TeamService.findAll();
      res.status(200).json(teams);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  };

  static getLeagueTeams = async (req: Request, res: Response): Promise<any> => {
    try {
      const { leagueId } = req.params;

      if (!leagueId) {
        return res.status(400).json({ message: 'leagueId is required' });
      }

      const teams = await prisma.team.findMany({
        where: { leagueId: parseInt(leagueId) },
        include: {
          players: true,
        },
      });

      res.status(200).send(teams);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getTeam = async (req: Request, res: Response) => {
    try {
      const team = await TeamService.findByTeamId(Number(req.params.id));

      if (!team) {
        res.status(404).send('Team not found');
        return;
      }

      res.status(200).json(team);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static createTeam = async (req: Request, res: Response) => {
    try {
      const newTeam = req.body;
      const team = await TeamService.create(newTeam);
      res.status(201).json(team);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  };

  static updateTeam = async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updatedTeam = req.body;
      const team = await TeamService.update(id, updatedTeam);

      if (!team) {
        res.status(404).send('Team not found');
        return;
      }

      res.status(200).json(team);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  };

  static deleteTeam = async (req: Request, res: Response) => {
    try {
      await TeamService.delete(Number(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export default TeamController;
