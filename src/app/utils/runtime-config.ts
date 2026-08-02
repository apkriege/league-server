type RuntimeEnvironment = NodeJS.ProcessEnv;

export const isRailwayEnvironment = (env: RuntimeEnvironment = process.env) =>
  Boolean(env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID || env.RAILWAY_SERVICE_ID);

export const isProductionRuntime = (env: RuntimeEnvironment = process.env) =>
  env.NODE_ENV === 'production' || isRailwayEnvironment(env);

export const isLiveProductionEnvironment = (env: RuntimeEnvironment = process.env) => {
  const railwayEnvironmentName = String(env.RAILWAY_ENVIRONMENT_NAME || '')
    .trim()
    .toLowerCase();
  if (railwayEnvironmentName) {
    return railwayEnvironmentName === 'production' || railwayEnvironmentName === 'prod';
  }
  return env.NODE_ENV === 'production';
};

const hasValue = (env: RuntimeEnvironment, name: string) => Boolean(String(env[name] || '').trim());

export const validateRuntimeConfig = (env: RuntimeEnvironment = process.env) => {
  const missing = ['DATABASE_URL', 'SESSION_SECRET'].filter((name) => !hasValue(env, name));
  const stripeProductTaxCode = String(env.STRIPE_PRODUCT_TAX_CODE || '').trim();

  if (stripeProductTaxCode && !/^txcd_\d{8}$/.test(stripeProductTaxCode)) {
    throw new Error('STRIPE_PRODUCT_TAX_CODE must be a valid Stripe tax code');
  }

  if (isProductionRuntime(env)) {
    const sessionSecret = String(env.SESSION_SECRET || '');
    if (sessionSecret.length < 32 || /replace|change-me|secret$/i.test(sessionSecret)) {
      throw new Error('SESSION_SECRET must be a unique production secret of at least 32 characters');
    }

    if (isLiveProductionEnvironment(env)) {
      missing.push(
        ...[
          'STRIPE_SECRET_KEY',
          'STRIPE_WEBHOOK_SECRET',
          'RESEND_API_KEY',
          'EMAIL_FROM',
          'SIGNUP_NOTIFICATION_TO',
        ].filter((name) => !hasValue(env, name)),
      );

      const stripeSecret = String(env.STRIPE_SECRET_KEY || '');
      if (stripeSecret && !/^(sk|rk)_live_/.test(stripeSecret)) {
        throw new Error('STRIPE_SECRET_KEY must be a live Stripe key in production');
      }

      const emailFrom = String(env.EMAIL_FROM || '').toLowerCase();
      if (emailFrom.includes('onboarding@resend.dev')) {
        throw new Error('EMAIL_FROM must use a verified sending domain in production');
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${[...new Set(missing)].join(', ')}`);
  }
};
