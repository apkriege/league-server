# Server

## Development

Set `DATABASE_URL`, `SESSION_SECRET`, and at least one trusted client origin in `CLIENT_URL` or `CLIENT_URLS`.

```bash
npm install
npm run db:generate
npm run dev
```

The API reads `PORT` and defaults to `3000`.

## Verification

```bash
npm run verify
```

This runs strict TypeScript checking, source-only Vitest tests, Prisma generation, and the production compile.

## Production

Required configuration includes:

- `NODE_ENV=production`
- `DATABASE_URL`
- `SESSION_SECRET`
- `CLIENT_URL` or `CLIENT_URLS`
- `COOKIE_SECURE=true`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID` or a valid per-golfer price configuration

Build and start commands:

```bash
npm run build:railway
npm run start:railway
```

The start command runs `prisma migrate deploy` before starting the compiled API. Commit every generated migration. Do not use `prisma db push` in production.

## Seed Commands

`npm run seed:demo` is for local demo data only, requires `DEMO_SEED_PASSWORD` with at least 10 characters, and exits with an error in production.

`npm run db:seed:users` requires all of these variables and has no credential defaults:

- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `SUPER_ADMIN_FIRST_NAME`
- `SUPER_ADMIN_LAST_NAME`
- `TEST_ADMIN_EMAIL`
- `TEST_ADMIN_PASSWORD`
- `TEST_ADMIN_FIRST_NAME`
- `TEST_ADMIN_LAST_NAME`

## Stripe

Configure Stripe to send `checkout.session.completed` to `POST /api/payments/webhook`. Checkout completion is recorded by unique Stripe session ID, so webhook retries are idempotent. Checkout success and cancel redirects are limited to configured client origins.
