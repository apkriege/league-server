import { Request, Response, NextFunction } from 'express';
import { isTrustedClientOrigin } from '../utils/origins';

export const requireTrustedOrigin = (req: Request, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
    return next();
  }

  const origin = req.headers.origin;
  if (!origin || isTrustedClientOrigin(origin)) {
    return next();
  }

  return res.status(403).json({ message: 'Request origin is not allowed' });
};

type RateLimiterOptions = {
  keyPrefix: string;
  windowMs: number;
  max: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export const createRateLimiter = ({ keyPrefix, windowMs, max }: RateLimiterOptions) => {
  const hits = new Map<string, RateLimitEntry>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const sessionUserId = req.session?.userId ? `user:${req.session.userId}` : `ip:${ip}`;
    const key = `${keyPrefix}:${sessionUserId}`;
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= max) {
      res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
      return res.status(429).json({ message: 'Too many requests. Please try again later.' });
    }

    current.count += 1;
    hits.set(key, current);
    return next();
  };
};
