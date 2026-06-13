import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';

const shouldLogDebug = () =>
  process.env.LOG_LEVEL === 'debug' || process.env.SESSION_DEBUG === 'true';

const getCookieNames = (cookieHeader?: string) => {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim().split('=')[0])
    .filter(Boolean);
};

const baseLog = (req: Request) => ({
  requestId: (req as any).requestId,
  method: req.method,
  path: req.originalUrl,
  origin: req.headers.origin || null,
  referer: req.headers.referer || null,
  userAgent: req.headers['user-agent'] || null,
  ip: req.ip,
  forwardedProto: req.headers['x-forwarded-proto'] || null,
  forwardedHost: req.headers['x-forwarded-host'] || null,
  hasCookieHeader: Boolean(req.headers.cookie),
  cookieNames: getCookieNames(req.headers.cookie),
  sessionId: req.sessionID || null,
  sessionUserId: req.session?.userId || null,
});

export const logInfo = (event: string, payload: Record<string, unknown>) => {
  console.log(JSON.stringify({ level: 'info', event, ...payload }));
};

export const logWarn = (event: string, payload: Record<string, unknown>) => {
  console.warn(JSON.stringify({ level: 'warn', event, ...payload }));
};

export const logError = (event: string, payload: Record<string, unknown>) => {
  console.error(JSON.stringify({ level: 'error', event, ...payload }));
};

export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const incomingRequestId = req.headers['x-request-id'];
  const id =
    typeof incomingRequestId === 'string' && incomingRequestId.trim()
      ? incomingRequestId.trim()
      : crypto.randomUUID();

  (req as any).requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  if (shouldLogDebug()) {
    logInfo('request:start', baseLog(req));
  }

  res.on('finish', () => {
    const statusCode = res.statusCode;
    const isError = statusCode >= 400;

    const payload = {
      ...baseLog(req),
      statusCode,
      durationMs: Date.now() - start,
      setCookie: Boolean(res.getHeader('set-cookie')),
    };

    if (isError) {
      logWarn('request:finish', payload);
      return;
    }

    logInfo('request:finish', payload);
  });

  next();
};

export const logAuth = (req: Request, event: string, payload: Record<string, unknown> = {}) => {
  logInfo(event, {
    ...baseLog(req),
    ...payload,
  });
};

export const logAuthFailure = (
  req: Request,
  event: string,
  payload: Record<string, unknown> = {},
) => {
  logWarn(event, {
    ...baseLog(req),
    ...payload,
  });
};
