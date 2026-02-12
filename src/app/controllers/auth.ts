import 'express-session';
import { Request, Response } from 'express';
import { prisma } from '../../prisma';

import User from '../models/user';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

class AuthController {
  static async register(req: Request, res: Response) {
    try {
      // const { username, password } = req.body;

      // const existingUser = await User.findOne({ username });
      // if (existingUser) {
      //   return res.status(400).json({ message: 'User already exists' });
      // }

      // const hashedPassword = await bcrypt.hash(password, 10);

      // const newUser = new User({ username, password: hashedPassword });
      // await newUser.save();

      return res.status(201).json({ message: 'User created' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      console.log(email, password);
      const user = await User.findByEmail(email);
      console.log(user);

      if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      const ids = await prisma.player.findMany({
        where: { userId: user.id },
        select: { id: true, leagueId: true },
      });

      const userWithLeagues = {
        ...user,
        leagues: ids.map((i) => ({ id: i.leagueId, playerId: i.id })),
      };

      // Set session
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ message: 'Server error' });
        }
        res.json({ message: 'Login successful', user: userWithLeagues });
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error:', err);
          return res.status(500).json({ message: 'Server error' });
        }
        res.clearCookie('connect.sid'); // Default session cookie name
        res.json({ message: 'Logout successful' });
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async getProfile(req: Request, res: Response) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const user = await User.findById(req.session.userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({ user });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }
}

export default AuthController;
