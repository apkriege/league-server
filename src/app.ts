import express, { Express, Request, Response, NextFunction } from 'express';
import api from './app/router';
import cors from 'cors';
import session from 'express-session';
import dotenv from 'dotenv';
import PgSession from 'connect-pg-simple';
import pg from 'pg';
dotenv.config();

const app: Express = express();

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200,
  })
);
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
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

app.get('/', (req: Request, res: Response) => {
  res.send('Hello, TypeScript with Express!');
});

// API routes
app.use('/api', api);

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'API is healthy' });
});

// High-level error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // const statusCode = err.statusCode || 500;
  const statusCode = 500;
  const name = err.name || 'Error';
  res.status(statusCode).json({ name, message: err.message });
});

export default app;
