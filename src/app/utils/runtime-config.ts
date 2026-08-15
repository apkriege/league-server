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

const assertPositiveInteger = (env: RuntimeEnvironment, name: string) => {
  if (!hasValue(env, name)) return;
  const value = Number(env[name]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive whole number`);
  }
};

const extractEmailAddress = (value: string) => {
  const namedAddress = value.match(/<([^<>]+)>\s*$/);
  return (namedAddress?.[1] || value).trim();
};

const isValidEmailAddress = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const validateRuntimeConfig = (env: RuntimeEnvironment = process.env) => {
  const missing = ['DATABASE_URL', 'SESSION_SECRET'].filter((name) => !hasValue(env, name));
  const stripeProductTaxCode = String(env.STRIPE_PRODUCT_TAX_CODE || '').trim();

  assertPositiveInteger(env, 'BILLING_MIN_GOLFERS');
  assertPositiveInteger(env, 'BILLING_PRICE_PER_GOLFER_CENTS');

  const billingCurrency = String(env.BILLING_CURRENCY || 'usd').trim();
  if (!/^[a-zA-Z]{3}$/.test(billingCurrency)) {
    throw new Error('BILLING_CURRENCY must be a three-letter currency code');
  }

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

      const stripeWebhookSecret = String(env.STRIPE_WEBHOOK_SECRET || '');
      if (stripeWebhookSecret && !stripeWebhookSecret.startsWith('whsec_')) {
        throw new Error('STRIPE_WEBHOOK_SECRET must be a valid Stripe webhook secret');
      }

      const stripePriceId = String(env.STRIPE_PRICE_ID || '');
      if (stripePriceId && !stripePriceId.startsWith('price_')) {
        throw new Error('STRIPE_PRICE_ID must be a valid Stripe price ID');
      }

      const resendApiKey = String(env.RESEND_API_KEY || '');
      if (resendApiKey && !resendApiKey.startsWith('re_')) {
        throw new Error('RESEND_API_KEY must be a valid Resend API key');
      }

      const emailFrom = String(env.EMAIL_FROM || '').toLowerCase();
      if (emailFrom.includes('onboarding@resend.dev')) {
        throw new Error('EMAIL_FROM must use a verified sending domain in production');
      }
      if (emailFrom && !isValidEmailAddress(extractEmailAddress(emailFrom))) {
        throw new Error('EMAIL_FROM must contain a valid email address');
      }

      const signupRecipients = String(env.SIGNUP_NOTIFICATION_TO || '')
        .split(/[,\s]+/)
        .filter(Boolean);
      if (signupRecipients.some((recipient) => !isValidEmailAddress(recipient))) {
        throw new Error('SIGNUP_NOTIFICATION_TO must contain valid email addresses');
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${[...new Set(missing)].join(', ')}`);
  }
};
