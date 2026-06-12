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
import { getConfiguredClientOrigins, isTrustedClientOrigin } from './app/utils/origins';

const app: Express = express();
const clientOrigins = getConfiguredClientOrigins();
const sessionSecret = process.env.SESSION_SECRET;

if (clientOrigins.length === 0) {
  throw new Error('Missing CLIENT_URL or CLIENT_URLS');
}

if (!sessionSecret) {
  throw new Error('Missing SESSION_SECRET');
}

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || isTrustedClientOrigin(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200,
};

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
    store: new pgSession({
      pool: pool,
      tableName: 'session',
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
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
  // const statusCode = err.statusCode || 500;
  const statusCode = 500;
  const name = err.name || 'Error';
  res.status(statusCode).json({ name, message: 'Internal server error' });
});

export default app;
