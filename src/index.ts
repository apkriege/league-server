import 'dotenv/config';
import './app/utils/suppress-local-logs';
import app from './app';

app.listen(3000, '0.0.0.0', () => {
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'server:start',
      port: 3000,
      nodeEnv: process.env.NODE_ENV ?? null,
      railwayEnvironment: process.env.RAILWAY_ENVIRONMENT ?? null,
    }),
  );
});
