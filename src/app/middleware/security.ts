import { Request, Response, NextFunction } from 'express';
import { isCorsOriginAllowed } from '../utils/origins';
import { logWarn } from './logging';

export const requireTrustedOrigin = (req: Request, res: Response, next: NextFunction) => {
  const origin = req.get('origin');

  if (isCorsOriginAllowed(origin)) {
    return next();
  }

  logWarn('security:origin-rejected', {
    requestId: (req as any).requestId,
    method: req.method,
    path: req.originalUrl,
    origin: origin || null,
  });

  return res.status(403).json({
    message: 'Request origin is not allowed',
    requestId: (req as any).requestId,
  });
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
  const maximumTrackedClients = 10_000;

  const pruneExpiredEntries = (now: number) => {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }

    while (hits.size >= maximumTrackedClients) {
      const oldestKey = hits.keys().next().value;
      if (!oldestKey) break;
      hits.delete(oldestKey);
    }
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const sessionUserId = req.session?.userId ? `user:${req.session.userId}` : `ip:${ip}`;
    const key = `${keyPrefix}:${sessionUserId}`;
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      if (hits.size >= maximumTrackedClients) pruneExpiredEntries(now);
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
