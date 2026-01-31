import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// const superProt = (req: Request, res: Response, next: NextFunction): any => {
//   console.log('SUPER PROTECTED');
//   const authHeader = req.headers.authorization;

//   if (authHeader) {
//     const token = authHeader.split(' ')[1];

//     jwt.verify(token, JWT_SECRET, (err, user: any) => {
//       if (err) {
//         console.log('err', err);
//         return res.sendStatus(403);
//       }

//       if (!user.isSuperAdmin) {
//         return res.sendStatus(403);
//       }

//       req.user = user;
//       next();
//     });
//   } else {
//     return res.sendStatus(401);
//   }
// };

export const adminGuard = (req: Request, res: Response, next: NextFunction): any => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, JWT_SECRET, (err, user: any) => {
      if (err) {
        console.log('err', err);
        return res.sendStatus(403);
      }

      if (user.role !== 'admin') {
        return res.sendStatus(403);
      }

      req.user = user;
      next();
    });
  } else {
    return res.sendStatus(401);
  }
};

export const userGuard = (req: Request, res: Response, next: NextFunction): any => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        console.log('err', err);
        return res.sendStatus(403);
      }

      req.user = user;
      next();
    });
  } else {
    return res.sendStatus(401);
  }
};
