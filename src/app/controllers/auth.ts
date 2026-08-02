import 'express-session';
import { Request, Response } from 'express';
import { prisma } from '../../prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import User from '../models/user';
import { BILLING_CURRENCY, BILLING_MIN_GOLFERS, BILLING_PRICE_PER_GOLFER_CENTS } from '../utils/billing';
import { logAuth, logAuthFailure } from '../middleware/logging';
import { sendSignupNotification } from '../services/signupNotification';
import { isProductionRuntime } from '../utils/runtime-config';
import { sendPasswordResetEmail } from '../services/passwordResetEmail';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    leagueAccess?: {
      leagueIds: number[];
      accessCodes?: Record<string, string>;
    };
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

const serializeLeagueViewer = (league: { id: number; name: string }) => ({
  id: `league-viewer-${league.id}`,
  firstName: 'League',
  lastName: 'Viewer',
  email: '',
  role: 'VIEWER',
  phone: null,
  metadata: { accessType: 'league-code' },
  leagues: [{ id: league.id, playerId: null, access: 'viewer' }],
  leagueAccess: { leagueId: league.id, leagueName: league.name },
});

const normalizeAccessCode = (code: unknown) =>
  String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const hashResetToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

class AuthController {
  static async requestPasswordReset(req: Request, res: Response) {
    const genericResponse = {
      message: 'If an account exists for that email, a password reset link has been sent.',
    };

    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const user = await prisma.user.findFirst({
        where: { email, deletedAt: null },
        select: { id: true, email: true, firstName: true },
      });
      if (!user) return res.status(200).json(genericResponse);

      const token = crypto.randomBytes(32).toString('hex');
      const now = new Date();
      await prisma.$transaction([
        prisma.password_reset_token.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: now },
        }),
        prisma.password_reset_token.create({
          data: {
            userId: user.id,
            tokenHash: hashResetToken(token),
            expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
          },
        }),
      ]);

      const emailResult = await sendPasswordResetEmail({
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        token,
      });
      if (emailResult.status !== 'sent') {
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'password-reset-email:failed',
            userId: user.id,
            reason: emailResult.reason,
          }),
        );
      }

      return res.status(200).json(genericResponse);
    } catch (error) {
      console.error('Password reset request failed:', error);
      return res.status(200).json(genericResponse);
    }
  }

  static async completePasswordReset(req: Request, res: Response) {
    try {
      const token = String(req.body?.token || '').trim();
      const password = String(req.body?.password || '');
      if (!token) return res.status(400).json({ message: 'Reset token is required' });
      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      }

      const resetToken = await prisma.password_reset_token.findUnique({
        where: { tokenHash: hashResetToken(token) },
        include: { user: { select: { id: true, deletedAt: true } } },
      });
      if (
        !resetToken ||
        resetToken.usedAt ||
        resetToken.expiresAt <= new Date() ||
        resetToken.user.deletedAt
      ) {
        return res.status(400).json({ message: 'This password reset link is invalid or expired' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.$transaction([
        prisma.user.update({
          where: { id: resetToken.userId },
          data: { password: hashedPassword },
        }),
        prisma.password_reset_token.updateMany({
          where: { userId: resetToken.userId, usedAt: null },
          data: { usedAt: new Date() },
        }),
      ]);

      return res.status(200).json({ message: 'Password reset successfully' });
    } catch (error) {
      console.error('Password reset failed:', error);
      return res.status(500).json({ message: 'Unable to reset password' });
    }
  }

  static async register(req: Request, res: Response) {
    try {
      const { firstName, lastName, email, password, invitationToken } = req.body || {};
      logAuth(req, 'auth:register:start', { emailProvided: Boolean(email) });

      if (!firstName || !lastName || !email || !password) {
        logAuthFailure(req, 'auth:register:invalid', { reason: 'missing-fields' });
        return res
          .status(400)
          .json({ message: 'First name, last name, email, and password are required' });
      }

      if (String(password).length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      let registrationRole = 'ADMIN';
      if (invitationToken) {
        const invitation = await prisma.league_invitation.findFirst({
          where: {
            token: String(invitationToken),
            email: normalizedEmail,
            status: 'pending',
            deletedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { id: true },
        });
        if (!invitation) {
          return res.status(400).json({
            message: 'This player invitation is invalid, expired, or belongs to another email',
          });
        }
        registrationRole = 'USER';
      }
      const existingUser = await User.findByEmail(normalizedEmail);
      if (existingUser) {
        logAuthFailure(req, 'auth:register:invalid', {
          reason: 'user-exists',
          email: normalizedEmail,
        });
        return res.status(400).json({ message: 'User already exists' });
      }

      const hashedPassword = await bcrypt.hash(String(password), 10);
      const user = await User.create({
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: normalizedEmail,
        username: normalizedEmail,
        password: hashedPassword,
        role: registrationRole,
        metadata: {
          billing: {
            includedGolfers: 0,
            minimumGolfers: BILLING_MIN_GOLFERS,
            pricePerGolferCents: BILLING_PRICE_PER_GOLFER_CENTS,
            currency: BILLING_CURRENCY,
          },
        },
      });
      await sendSignupNotification({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      });

      req.session.regenerate((err) => {
        if (err) {
          logAuthFailure(req, 'auth:session:regenerate-failed', {
            flow: 'register',
            error: err.message,
          });
          return res.status(500).json({ message: 'Server error' });
        }

        req.session.userId = user.id;
        req.session.save((saveErr) => {
          if (saveErr) {
            logAuthFailure(req, 'auth:session:save-failed', {
              flow: 'register',
              userId: user.id,
              error: saveErr.message,
            });
            return res.status(500).json({ message: 'Server error' });
          }

          logAuth(req, 'auth:register:success', { userId: user.id, sessionId: req.sessionID });
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
      logAuth(req, 'auth:login:start', { email: normalizedEmail || null });

      if (!normalizedEmail || !password) {
        logAuthFailure(req, 'auth:login:invalid', { reason: 'missing-email-or-password' });
        return res.status(400).json({ message: 'Email and password are required' });
      }

      const user = await User.findByEmail(normalizedEmail);

      if (!user || user.deletedAt) {
        logAuthFailure(req, 'auth:login:invalid', { reason: 'user-not-found-or-deleted' });
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      const isPasswordValid = await bcrypt.compare(String(password), String(user.password || ''));
      if (!isPasswordValid) {
        logAuthFailure(req, 'auth:login:invalid', { reason: 'bad-password', userId: user.id });
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
          logAuthFailure(req, 'auth:session:regenerate-failed', {
            flow: 'login',
            userId: user.id,
            error: err.message,
          });
          return res.status(500).json({ message: 'Server error' });
        }

        req.session.userId = user.id;
        req.session.save((saveErr) => {
          if (saveErr) {
            logAuthFailure(req, 'auth:session:save-failed', {
              flow: 'login',
              userId: user.id,
              error: saveErr.message,
            });
            return res.status(500).json({ message: 'Server error' });
          }
          logAuth(req, 'auth:login:success', {
            userId: user.id,
            sessionId: req.sessionID,
            leagueCount: userWithLeagues.leagues.length,
          });
          res.json({ message: 'Login successful', user: userWithLeagues });
        });
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  static async loginWithLeagueCode(req: Request, res: Response) {
    try {
      const accessCode = normalizeAccessCode(req.body?.code);
      logAuth(req, 'auth:league-code-login:start', { codeProvided: Boolean(accessCode) });

      if (!accessCode) {
        logAuthFailure(req, 'auth:league-code-login:invalid', { reason: 'missing-code' });
        return res.status(400).json({ message: 'League access code is required' });
      }

      const league = await prisma.league.findFirst({
        where: {
          viewerAccessCode: accessCode,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!league) {
        logAuthFailure(req, 'auth:league-code-login:invalid', { reason: 'bad-code' });
        return res.status(400).json({ message: 'Invalid league access code' });
      }

      req.session.regenerate((err) => {
        if (err) {
          logAuthFailure(req, 'auth:session:regenerate-failed', {
            flow: 'league-code-login',
            leagueId: league.id,
            error: err.message,
          });
          return res.status(500).json({ message: 'Server error' });
        }

        req.session.leagueAccess = {
          leagueIds: [league.id],
          accessCodes: { [String(league.id)]: accessCode },
        };
        req.session.save((saveErr) => {
          if (saveErr) {
            logAuthFailure(req, 'auth:session:save-failed', {
              flow: 'league-code-login',
              leagueId: league.id,
              error: saveErr.message,
            });
            return res.status(500).json({ message: 'Server error' });
          }

          logAuth(req, 'auth:league-code-login:success', {
            leagueId: league.id,
            sessionId: req.sessionID,
          });
          return res.json({
            message: 'League access granted',
            user: serializeLeagueViewer(league),
            leagueId: league.id,
          });
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
          logAuthFailure(req, 'auth:logout:failed', { error: err.message });
          return res.status(500).json({ message: 'Server error' });
        }
        logAuth(req, 'auth:logout:success');
        const secure = process.env.COOKIE_SECURE === 'true' || isProductionRuntime();
        res.clearCookie(process.env.SESSION_COOKIE_NAME || 'connect.sid', {
          httpOnly: true,
          path: '/',
          sameSite: secure ? 'none' : 'lax',
          secure,
        });
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
        logAuthFailure(req, 'auth:me:unauthorized', { reason: 'missing-session-user' });
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const user = await User.findById(req.session.userId);
      if (!user) {
        logAuthFailure(req, 'auth:me:not-found', { userId: req.session.userId });
        return res.status(404).json({ message: 'User not found' });
      }

      const memberships = await prisma.player.findMany({
        where: { userId: user.id, deletedAt: null },
        select: { id: true, leagueId: true },
      });
      logAuth(req, 'auth:me:success', { userId: user.id });
      res.json({
        user: serializeUser(user, {
          leagues: memberships.map((membership) => ({
            id: membership.leagueId,
            playerId: membership.id,
          })),
        }),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }
}

export const generateLeagueAccessCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

export default AuthController;
