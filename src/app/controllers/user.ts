import { Request, Response } from 'express';
import UserService from '../models/user';
import { prisma } from '../../prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendEmailVerificationEmail } from '../services/emailVerificationEmail';
import { getPublicErrorResponse } from '../utils/error-response';

const serializeUser = (user: any) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  username: user.username,
  role: user.role,
  phone: user.phone,
  metadata: user.metadata,
  emailVerifiedAt: user.emailVerifiedAt,
  managedLeagueCount: user._count?.manager ?? 0,
  playerProfileCount: user._count?.players ?? 0,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  deletedAt: user.deletedAt,
});

const sendPublicError = (res: Response, error: unknown) => {
  const response = getPublicErrorResponse(error);
  return res.status(response.status).json({ message: response.message });
};

class UserController {
  static sanitizeUserUpdatePayload = (payload: any, canManageRoles: boolean) => {
    const data: Record<string, unknown> = {};

    if (payload.firstName != null) data.firstName = String(payload.firstName).trim();
    if (payload.lastName != null) data.lastName = String(payload.lastName).trim();
    if (payload.email != null) data.email = String(payload.email).trim().toLowerCase();
    if (payload.phone !== undefined) data.phone = payload.phone ? String(payload.phone).trim() : null;
    if (payload.password) data.password = payload.password;

    if (canManageRoles) {
      if (payload.username != null) data.username = String(payload.username).trim();
      if (payload.role != null) {
        const role = String(payload.role).trim().toUpperCase();
        if (!['USER', 'ADMIN', 'SUPER'].includes(role)) {
          throw new Error('Invalid user role');
        }
        data.role = role;
      }
    }

    return data;
  };

  static getUsers = async (_req: Request, res: Response) => {
    try {
      const users = await UserService.findAll();
      res.status(200).json(users.map(serializeUser));
    } catch (error) {
      console.error(error);
      return sendPublicError(res, error);
    }
  };

  static getUserById = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const user = await UserService.findById(id);

      if (!user) {
        res.status(404).send({ message: 'User not found' });
        return;
      }

      res.status(200).json(serializeUser(user));
    } catch (error) {
      console.error(error);
      return sendPublicError(res, error);
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

      res.status(200).json(serializeUser(user));
    } catch (error) {
      console.error(error);
      return sendPublicError(res, error);
    }
  };

  static createUser = async (req: Request, res: Response) => {
    try {
      const newUser = UserController.sanitizeUserUpdatePayload(req.body || {}, true);
      if (!newUser.firstName || !newUser.lastName || !newUser.email || !newUser.password) {
        return res.status(400).json({ message: 'First name, last name, email, and password are required' });
      }
      if (String(newUser.password).length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      }
      if (newUser.password) {
        newUser.password = await bcrypt.hash(String(newUser.password), 10);
      }
      const user = await UserService.create(newUser);
      res.status(201).json(serializeUser(user));
    } catch (error) {
      console.error(error);
      return sendPublicError(res, error);
    }
  };

  static updateUser = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const sessionUser = req.user as { id: number; role: string };
      const role = String(sessionUser?.role || '').toUpperCase();
      const canManageRoles = role === 'SUPER';
      const updatedUser = UserController.sanitizeUserUpdatePayload(req.body || {}, canManageRoles);

      if (Object.keys(updatedUser).length === 0) {
        return res.status(400).json({ message: 'No valid fields provided for update' });
      }

      const existing = await UserService.findById(id);
      if (!existing) return res.status(404).json({ message: 'User not found' });
      const changedEmail = typeof updatedUser.email === 'string' && updatedUser.email !== existing.email
        ? updatedUser.email : null;
      if (changedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changedEmail)) {
        return res.status(400).json({ message: 'Enter a valid email address' });
      }
      const passwordChanged = Boolean(updatedUser.password);
      if (changedEmail || passwordChanged) {
        const actor = await UserService.findById(sessionUser.id);
        if (!actor || !await bcrypt.compare(String(req.body?.currentPassword || ''), actor.password)) {
          return res.status(403).json({ message: 'Your current password is required for this change' });
        }
      }
      if (passwordChanged) {
        if (String(updatedUser.password).length < 8) {
          return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }
        updatedUser.password = await bcrypt.hash(String(updatedUser.password), 10);
      }
      delete updatedUser.email;
      const verificationToken = changedEmail ? crypto.randomBytes(32).toString('hex') : null;
      const user = await prisma.$transaction(async (tx) => {
        if (changedEmail) {
          const duplicate = await tx.user.findUnique({ where: { email: changedEmail }, select: { id: true } });
          if (duplicate) throw new Error('Email address is already in use');
          await tx.email_verification_token.updateMany({
            where: { userId: id, usedAt: null }, data: { usedAt: new Date() },
          });
          await tx.email_verification_token.create({
            data: {
              userId: id, pendingEmail: changedEmail,
              tokenHash: crypto.createHash('sha256').update(String(verificationToken)).digest('hex'),
              redirectPath: '/leagues', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
        }
        if (passwordChanged) {
          await tx.session.deleteMany({
            where: { sid: { not: req.sessionID }, sess: { path: ['userId'], equals: id } },
          });
          await tx.password_reset_token.updateMany({
            where: { userId: id, usedAt: null }, data: { usedAt: new Date() },
          });
        }
        return tx.user.update({ where: { id }, data: updatedUser });
      });
      if (changedEmail && verificationToken) {
        await sendEmailVerificationEmail({
          userId: id, email: changedEmail, firstName: user.firstName, token: verificationToken,
        });
      }

      if (!user) {
        res.status(404).send({ message: 'User not found' });
        return;
      }

      res.status(200).json({ ...serializeUser(user), ...(changedEmail ? { message: 'Verify your new email address to finish the change.' } : {}) });
    } catch (error) {
      console.error(error);
      if (error instanceof Error && error.message === 'Email address is already in use') {
        return res.status(409).json({ message: error.message });
      }
      return sendPublicError(res, error);
    }
  };

  static deleteUser = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const activeManagedLeagues = await prisma.league.count({
        where: { adminId: id, deletedAt: null },
      });
      if (activeManagedLeagues > 0) {
        return res.status(409).json({
          message: 'Transfer or delete active leagues before deleting this account',
        });
      }
      await UserService.delete(id);
      res.status(200).json({ message: 'User deleted' });
    } catch (error) {
      console.error(error);
      return sendPublicError(res, error);
    }
  };

  static getUserLeagues = async (req: Request, res: Response) => {
    try {
      const userId = Number(req.params.id);
      const leagueIds = await prisma.player.findMany({
        where: { userId, deletedAt: null },
        select: { leagueId: true },
      });

      const leagues = await prisma.league.findMany({
        where: { id: { in: leagueIds.map((l: any) => l.leagueId) }, deletedAt: null },
      });

      if (!leagues) {
        res.status(404).send({ message: 'Leagues not found for user' });
        return;
      }

      res.status(200).json(leagues);
    } catch (error) {
      console.error(error);
      return sendPublicError(res, error);
    }
  };
}

export default UserController;
