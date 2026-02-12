import { Request, Response } from 'express';
import UserService from '../models/user';
import { prisma } from '../../prisma';

class UserController {
  static getUsers = async (req: Request, res: Response) => {
    try {
      const users = await UserService.findAll();
      res.status(200).json(users);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  };

  static getUserById = async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const user = await UserService.findById(id);

      if (!user) {
        res.status(404).send({ message: 'User not found' });
        return;
      }

      res.status(200).json(user);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  };

  static getProfile = async (req: Request, res: Response) => {
    try {
      const { email } = req.user as { email: string };

      const user = await UserService.findByEmail(email);

      if (!user) {
        res.status(404).send({ message: 'User not found' });
        return;
      }

      res.status(200).json(user);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  };

  static createUser = async (req: Request, res: Response) => {
    try {
      const newUser = req.body;
      const user = await UserService.create(newUser);
      res.status(201).json(user);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  };

  static updateUser = async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updatedUser = req.body;
      const user = await UserService.update(id, updatedUser);

      if (!user) {
        res.status(404).send({ message: 'User not found' });
        return;
      }

      res.status(200).json(user);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  };

  static deleteUser = async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const user = await UserService.delete(id);
      res.status(200).json(user);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  };

  static getUserLeagues = async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const leagueIds = await prisma.player.findMany({
        where: { userId },
        select: { leagueId: true },
      });

      const leagues = await prisma.league.findMany({
        where: { id: { in: leagueIds.map((l) => l.leagueId) } },
      });

      if (!leagues) {
        res.status(404).send({ message: 'Leagues not found for user' });
        return;
      }

      res.status(200).json(leagues);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  };
}

export default UserController;
