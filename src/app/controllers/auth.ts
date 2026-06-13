import 'express-session';
import { Request, Response } from 'express';
import { prisma } from '../../prisma';
import bcrypt from 'bcryptjs';

import User from '../models/user';
import { BILLING_CURRENCY, BILLING_MIN_GOLFERS, BILLING_PRICE_PER_GOLFER_CENTS } from '../utils/billing';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

const serializeUser = (user: any, extra: Record<string, unknown> = {}) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  role: user.role,
  phone: user.phone ?? null,
  metadata: user.metadata ?? null,
  ...extra,
});

class AuthController {
  static async debugSession(req: Request, res: Response) {
    res.json({
      authenticated: Boolean(req.session.userId),
      hasCookieHeader: Boolean(req.headers.cookie),
      sessionId: req.sessionID,
      userId: req.session.userId ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
      railwayEnvironment: process.env.RAILWAY_ENVIRONMENT ?? null,
    });
  }

  static async register(req: Request, res: Response) {
    try {
      const { firstName, lastName, email, password } = req.body || {};

      if (!firstName || !lastName || !email || !password) {
        return res
          .status(400)
          .json({ message: 'First name, last name, email, and password are required' });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const existingUser = await User.findByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      const hashedPassword = await bcrypt.hash(String(password), 10);
      const user = await User.create({
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: normalizedEmail,
        username: normalizedEmail,
        password: hashedPassword,
        role: 'ADMIN',
        metadata: {
          billing: {
            includedGolfers: 0,
            minimumGolfers: BILLING_MIN_GOLFERS,
            pricePerGolferCents: BILLING_PRICE_PER_GOLFER_CENTS,
            currency: BILLING_CURRENCY,
          },
        },
      });

      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regenerate error:', err);
          return res.status(500).json({ message: 'Server error' });
        }

        req.session.userId = user.id;
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save error:', saveErr);
            return res.status(500).json({ message: 'Server error' });
          }

          return res.status(201).json({
            message: 'User created',
            user: serializeUser(user, { leagues: [] }),
          });
        });
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body || {};
      const normalizedEmail = String(email || '')
        .trim()
        .toLowerCase();

      if (!normalizedEmail || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      const user = await User.findByEmail(normalizedEmail);

      if (!user || user.deletedAt) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      const isPasswordValid = await bcrypt.compare(String(password), String(user.password || ''));
      if (!isPasswordValid) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      const ids = await prisma.player.findMany({
        where: { userId: user.id, deletedAt: null },
        select: { id: true, leagueId: true },
      });

      const userWithLeagues = {
        ...serializeUser(user),
        leagues: ids.map((i) => ({ id: i.leagueId, playerId: i.id })),
      };

      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regenerate error:', err);
          return res.status(500).json({ message: 'Server error' });
        }

        req.session.userId = user.id;
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save error:', saveErr);
            return res.status(500).json({ message: 'Server error' });
          }
          res.json({ message: 'Login successful', user: userWithLeagues });
        });
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
        res.clearCookie('connect.sid');
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

      res.json({ user: serializeUser(user) });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }
}

export default AuthController;
