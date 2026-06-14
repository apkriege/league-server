import express, { Express, Request, Response, NextFunction } from 'express';
import api from './app/router';
import cors from 'cors';
import session from 'express-session';
import dotenv from 'dotenv';
import PgSession from 'connect-pg-simple';
import pg from 'pg';
dotenv.config();
import Payment from './app/controllers/payment';
import HealthController from './app/controllers/health';
import { requireTrustedOrigin } from './app/middleware/security';
import { logError, logInfo, requestId, requestLogger } from './app/middleware/logging';
import { getPublicErrorResponse } from './app/utils/error-response';

const app: Express = express();
const sessionSecret = process.env.SESSION_SECRET;
const isRailway =
  Boolean(process.env.RAILWAY_ENVIRONMENT) ||
  Boolean(process.env.RAILWAY_PROJECT_ID) ||
  Boolean(process.env.RAILWAY_SERVICE_ID);
const useSecureCookies =
  process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production' || isRailway;
const sessionCookieName = process.env.SESSION_COOKIE_NAME || 'connect.sid';

app.set('trust proxy', true);

if (!sessionSecret) {
  throw new Error('Missing SESSION_SECRET');
}

logInfo('server:config', {
  nodeEnv: process.env.NODE_ENV ?? null,
  railwayEnvironment: process.env.RAILWAY_ENVIRONMENT ?? null,
  useSecureCookies,
  sessionCookieName,
  sessionSameSite: useSecureCookies ? 'none' : 'lax',
  trustProxy: true,
});

const corsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Access-Control-Allow-Origin',
  ],
  optionsSuccessStatus: 200,
};

app.use(requestId);
app.use(requestLogger);
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

// High-level error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const errorResponse = getPublicErrorResponse(err);
  const name = err.name || 'Error';
  logError('request:error', {
    requestId: (req as any).requestId,
    method: req.method,
    path: req.originalUrl,
    name,
    message: err.message,
    stack: process.env.LOG_LEVEL === 'debug' ? err.stack : undefined,
  });
  res.status(errorResponse.status).json({
    name,
    message: errorResponse.message,
    requestId: (req as any).requestId,
  });
});

export default app;
