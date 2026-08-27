const isRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID,
);
const isProduction = process.env.NODE_ENV === 'production' || isRailway;

if (isProduction) {
  console.error('Destructive database commands are disabled in production and on Railway.');
  process.exit(1);
}
