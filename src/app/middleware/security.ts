import { Request, Response, NextFunction } from 'express';
import {
  getConfiguredClientOrigins,
  isTrustedClientOrigin,
  normalizeOrigin,
} from '../utils/origins';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireTrustedOrigin = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  if (getConfiguredClientOrigins().length === 0) {
    return res.status(500).json({ message: 'Server origin configuration is invalid' });
  }

  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const refererHeader = typeof req.headers.referer === 'string' ? req.headers.referer : '';
  const requestOrigin = normalizeOrigin(originHeader) || normalizeOrigin(refererHeader);

  if (!requestOrigin) {
    if (process.env.NODE_ENV !== 'production') {
      return next();
    }
    return res.status(403).json({ message: 'Untrusted request origin' });
  }

  if (!isTrustedClientOrigin(requestOrigin)) {
    return res.status(403).json({ message: 'Untrusted request origin' });
  }

  return next();
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
