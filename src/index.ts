import 'dotenv/config';
import './app/utils/suppress-local-logs';
import app, { closeAppResources } from './app';
import { prisma } from './prisma';

const port = Number(process.env.PORT || 3000);

const server = app.listen(port, '0.0.0.0', () => {
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'server:start',
      port,
      nodeEnv: process.env.NODE_ENV ?? null,
      railwayEnvironment: process.env.RAILWAY_ENVIRONMENT ?? null,
    }),
  );
});

let shuttingDown = false;

const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(JSON.stringify({ level: 'info', event: 'server:shutdown', signal }));

  const forceExit = setTimeout(() => {
    console.error(JSON.stringify({ level: 'error', event: 'server:shutdown-timeout', signal }));
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (error) => {
    const results = await Promise.allSettled([closeAppResources(), prisma.$disconnect()]);
    clearTimeout(forceExit);

    const resourceFailure = results.some((result) => result.status === 'rejected');
    if (error || resourceFailure) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'server:shutdown-failed',
          message: error?.message ?? 'Failed to close one or more database resources',
        }),
      );
      process.exit(1);
    }

    process.exit(0);
  });
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
