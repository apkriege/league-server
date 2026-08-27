import express, { Express, Request, Response, NextFunction } from 'express';
import api from './app/router';
import cors from 'cors';
import session from 'express-session';
import dotenv from 'dotenv';
import PgSession from 'connect-pg-simple';
import pg from 'pg';
import helmet from 'helmet';
dotenv.config();
import Payment from './app/controllers/payment';
import HealthController from './app/controllers/health';
import { requireTrustedOrigin } from './app/middleware/security';
import { normalizeErrorResponses } from './app/middleware/error-responses';
import { logError, logInfo, requestId, requestLogger } from './app/middleware/logging';
import { getPublicErrorResponse } from './app/utils/error-response';
import { getConfiguredClientOrigins, isCorsOriginAllowed } from './app/utils/origins';
import {
  isProductionRuntime,
  isRailwayEnvironment,
  validateRuntimeConfig,
} from './app/utils/runtime-config';

const app: Express = express();
validateRuntimeConfig();
const sessionSecret = process.env.SESSION_SECRET;
const isRailway = isRailwayEnvironment();
const isProduction = isProductionRuntime();
const useSecureCookies =
  process.env.COOKIE_SECURE === 'true' || isProduction;
const sessionCookieName = process.env.SESSION_COOKIE_NAME || 'connect.sid';
const configuredClientOrigins = getConfiguredClientOrigins();

app.set('trust proxy', 1);

if (!sessionSecret) {
  throw new Error('Missing SESSION_SECRET');
}

if (isProduction && configuredClientOrigins.length === 0) {
  throw new Error('Missing valid CLIENT_URL or CLIENT_URLS');
}

logInfo('server:config', {
  nodeEnv: process.env.NODE_ENV ?? null,
  railwayEnvironment: process.env.RAILWAY_ENVIRONMENT ?? null,
  useSecureCookies,
  sessionCookieName,
  sessionSameSite: useSecureCookies ? 'none' : 'lax',
  trustProxy: 1,
  clientOrigins: configuredClientOrigins,
});

const corsOptions = {
  origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    callback(null, isCorsOriginAllowed(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  exposedHeaders: ['X-Request-Id'],
  optionsSuccessStatus: 204,
  maxAge: 60 * 60 * 24,
};

app.use(requestId);
app.use(normalizeErrorResponses);
app.use(requestLogger);
app.use(helmet());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Stripe webhook must use the raw request body, so it is mounted before JSON parsing middleware.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), Payment.handleWebhook);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const pgSession = PgSession(session);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const closeAppResources = () => pool.end();

app.use(
  session({
    name: sessionCookieName,
    store: new pgSession({
      pool: pool,
      tableName: 'session',
    }),
    proxy: useSecureCookies,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: useSecureCookies,
      httpOnly: true,
      sameSite: useSecureCookies ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

app.get('/', (req: Request, res: Response) => {
  res.send('Hello, TypeScript with Express!');
});

// API routes
app.use('/api', requireTrustedOrigin, api);

app.get('/health', HealthController.getHealth);

// Keep unmatched routes out of Express's default HTML 404 handler.
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 404,
    name: 'NotFound',
    message: 'Route not found',
    path: req.originalUrl,
    requestId: req.requestId,
  });
});

// High-level error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }

  const errorResponse = getPublicErrorResponse(err);
  const name = err.name || 'Error';
  logError('request:error', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    name,
    message: err.message,
    stack: process.env.LOG_LEVEL === 'debug' ? err.stack : undefined,
  });
  res.status(errorResponse.status).json({
    status: errorResponse.status,
    name,
    message: errorResponse.message,
    requestId: req.requestId,
  });
});

export default app;
