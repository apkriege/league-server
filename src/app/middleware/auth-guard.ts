import { Request, Response, NextFunction } from 'express';
import UserService from '../models/user';

export const adminGuard = (req: Request, res: Response, next: NextFunction): any => {
  const userId = req.session.userId;

  if (!userId) {
    return res.sendStatus(401);
  }

  UserService.findById(userId)
    .then((user) => {
      if (!user) {
        return res.sendStatus(401);
      }

      if (String(user.role).toUpperCase() !== 'ADMIN') {
        return res.sendStatus(403);
      }

      req.user = user;
      next();
    })
    .catch((error) => {
      console.error('Session auth error:', error);
      return res.sendStatus(500);
    });
};

export const userGuard = (req: Request, res: Response, next: NextFunction): any => {
  const userId = req.session.userId;
  if (!userId) {
    return res.sendStatus(401);
  }

  UserService.findById(userId)
    .then((user) => {
      if (!user) {
        return res.sendStatus(401);
      }

      req.user = user;
      next();
    })
    .catch((error) => {
      console.error('Session auth error:', error);
      return res.sendStatus(500);
    });
};
