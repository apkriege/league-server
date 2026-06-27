const isHostedRuntime =
  Boolean(process.env.RAILWAY_ENVIRONMENT) ||
  Boolean(process.env.RAILWAY_PROJECT_ID) ||
  Boolean(process.env.RAILWAY_SERVICE_ID);

const isLocalRuntime =
  !isHostedRuntime &&
  !['production', 'staging'].includes(String(process.env.NODE_ENV || 'development').toLowerCase());

if (isLocalRuntime && process.env.LOCAL_SERVER_LOGS !== 'true') {
  console.debug = () => undefined;
  console.info = () => undefined;
  console.log = () => undefined;
  console.warn = () => undefined;
  console.error = () => undefined;
}
