import 'dotenv/config';
import './app/utils/suppress-local-logs';
import app from './app';

const port = Number(process.env.PORT || 3000);

app.listen(port, '0.0.0.0', () => {
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
