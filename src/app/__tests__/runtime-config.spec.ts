import { describe, expect, it } from 'vitest';
import { validateRuntimeConfig } from '../utils/runtime-config';

const productionEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://example',
  SESSION_SECRET: 'a-unique-production-session-secret-that-is-long',
  CLIENT_URL: 'https://app.example.com',
  STRIPE_SECRET_KEY: 'sk_live_example',
  STRIPE_WEBHOOK_SECRET: 'whsec_example',
  RESEND_API_KEY: 're_example',
  EMAIL_FROM: 'League Night Pro <notifications@example.com>',
  SIGNUP_NOTIFICATION_TO: 'owner@example.com',
};

describe('runtime configuration validation', () => {
  it('accepts complete production configuration', () => {
    expect(() => validateRuntimeConfig(productionEnvironment)).not.toThrow();
  });

  it('requires infrastructure configuration in every environment', () => {
    expect(() => validateRuntimeConfig({ NODE_ENV: 'test' })).toThrow(
      'Missing required environment variables: DATABASE_URL, SESSION_SECRET',
    );
  });

  it('rejects missing production integrations', () => {
    expect(() =>
      validateRuntimeConfig({
        NODE_ENV: 'production',
        DATABASE_URL: productionEnvironment.DATABASE_URL,
        SESSION_SECRET: productionEnvironment.SESSION_SECRET,
      }),
    ).toThrow(/STRIPE_SECRET_KEY.*STRIPE_WEBHOOK_SECRET.*RESEND_API_KEY.*EMAIL_FROM/);
  });

  it('rejects short or placeholder production session secrets', () => {
    expect(() =>
      validateRuntimeConfig({
        ...productionEnvironment,
        SESSION_SECRET: 'replace-with-a-long-random-secret',
      }),
    ).toThrow(/unique production secret/);
  });

  it('rejects test Stripe keys and the Resend onboarding sender in production', () => {
    expect(() =>
      validateRuntimeConfig({
        ...productionEnvironment,
        STRIPE_SECRET_KEY: 'sk_test_example',
      }),
    ).toThrow(/live Stripe key/);

    expect(() =>
      validateRuntimeConfig({
        ...productionEnvironment,
        EMAIL_FROM: 'League Night Pro <onboarding@resend.dev>',
      }),
    ).toThrow(/verified sending domain/);
  });

  it('rejects invalid production integration identifiers and email addresses', () => {
    expect(() =>
      validateRuntimeConfig({
        ...productionEnvironment,
        STRIPE_WEBHOOK_SECRET: 'invalid',
      }),
    ).toThrow(/valid Stripe webhook secret/);

    expect(() =>
      validateRuntimeConfig({
        ...productionEnvironment,
        RESEND_API_KEY: 'invalid',
      }),
    ).toThrow(/valid Resend API key/);

    expect(() =>
      validateRuntimeConfig({
        ...productionEnvironment,
        SIGNUP_NOTIFICATION_TO: 'not-an-email',
      }),
    ).toThrow(/valid email addresses/);
  });

  it('rejects invalid billing configuration', () => {
    expect(() =>
      validateRuntimeConfig({
        ...productionEnvironment,
        BILLING_MIN_GOLFERS: '8.5',
      }),
    ).toThrow(/BILLING_MIN_GOLFERS must be a positive whole number/);

    expect(() =>
      validateRuntimeConfig({
        ...productionEnvironment,
        BILLING_PRICE_PER_GOLFER_CENTS: 'free',
      }),
    ).toThrow(/BILLING_PRICE_PER_GOLFER_CENTS must be a positive whole number/);

    expect(() =>
      validateRuntimeConfig({
        ...productionEnvironment,
        BILLING_CURRENCY: 'dollars',
      }),
    ).toThrow(/three-letter currency code/);
  });

  it('allows optional integrations to be unconfigured in Railway development', () => {
    expect(() =>
      validateRuntimeConfig({
        NODE_ENV: 'production',
        DATABASE_URL: productionEnvironment.DATABASE_URL,
        SESSION_SECRET: productionEnvironment.SESSION_SECRET,
        CLIENT_URL: productionEnvironment.CLIENT_URL,
        RAILWAY_PROJECT_ID: 'project-id',
        RAILWAY_ENVIRONMENT_NAME: 'development',
      }),
    ).not.toThrow();
  });
});
