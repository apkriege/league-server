# Server

## Required environment variables

Copy `.env.example` to `.env` and set:
x

- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `CLIENT_URL`
- `SESSION_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Optional:

- `CLIENT_URLS`
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `SUPER_ADMIN_FIRST_NAME`
- `SUPER_ADMIN_LAST_NAME`
- `STRIPE_PRODUCT_NAME`
- `STRIPE_UNIT_AMOUNT`
- `STRIPE_CURRENCY`
- `STRIPE_CHECKOUT_SUCCESS_URL`
- `STRIPE_CHECKOUT_CANCEL_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## Local development

1. Start Postgres.
2. Set `DATABASE_URL`.
3. Run `npm run db:generate`.
4. Run `npm run dev`.

## Production

1. Commit Prisma migrations from `prisma/migrations`.
2. Run `npm run build`.
3. Run `npm run db:migrate:deploy`.
4. Run `npm run start:prod`.
5. Configure the Stripe webhook to `POST /api/payments/webhook`.

## Railway deployment

Use the server as its own Railway service.

If this repo is deployed as a monorepo:

1. Set the Railway service root directory to `server`.
2. Attach a PostgreSQL database service.
3. Ensure `DATABASE_URL` is available to the server service.

The checked-in Railway flow is:

- Build: `npm run build:railway`
- Start: `npm run start:railway`
- Build behavior: generates Prisma Client, applies pending migrations, ensures the super admin user, then compiles TypeScript
- Startup behavior: applies `prisma migrate deploy` again as an idempotent safety check, then starts `node dist/src/index.js`

Important:

- Do not use `prisma db push` in production.
- Create migrations locally with `npx prisma migrate dev --name your_change_name`.
- Commit the generated `prisma/migrations/*` files to GitHub before deploying.
- The initial migration creates the tables for a fresh Railway PostgreSQL database.
- `DATABASE_URL` must be available to the Railway server service during build.
- The super admin defaults to `adamkrieger87@gmail.com` with password `testing`; set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in Railway to override those values.
- `prisma migrate deploy` is safe to run on every deploy and will only apply pending migrations.
- `prisma` is kept in `dependencies` so the CLI is present in the Railway runtime when migrations run.

## Notes

- Session auth requires a shared `SESSION_SECRET`.
- `CLIENT_URL` should be the primary frontend origin used for checkout redirects.
- `CLIENT_URLS` can be a comma-separated list of additional allowed frontend origins for CORS.
- Google sign-in is not enabled unless the OAuth env vars and routes are configured.
