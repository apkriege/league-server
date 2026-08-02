# Server test

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

### Railway CORS and cookies

Set `CLIENT_URL` to the exact public origin that serves the browser client. Do not set it to the API
service URL and do not include `/api` or another path.

```env
CLIENT_URL=https://your-client.up.railway.app
CLIENT_URLS=https://app.your-custom-domain.com
COOKIE_SECURE=true
```

`CLIENT_URLS` is optional and accepts comma- or whitespace-separated additional origins. Host-only
Railway values such as `your-client.up.railway.app` are normalized to HTTPS, although full URLs are
clearer. Origins are exact: scheme, hostname, and non-default port must match the browser's `Origin`
header. Paths and trailing slashes are ignored.

The client build must point to the API service:

```env
VITE_API_URL=https://your-api.up.railway.app/api
```

Because authentication uses a cross-origin session cookie, browser requests must retain
`withCredentials: true` (already configured in `client/api/client.ts`). Railway production cookies
are emitted with `Secure`, `HttpOnly`, and `SameSite=None`. If `CLIENT_URL`/`CLIENT_URLS` contains no
valid origin, the Railway server now exits at startup with `Missing valid CLIENT_URL or CLIENT_URLS`
instead of starting with unusable CORS.

On startup, the structured `server:config` log records the normalized `clientOrigins` allowlist. Use
that value and the browser console's request `Origin` to diagnose a mismatch without logging secrets.

Build and start commands:

```bash
npm run build
npm start
```

The committed Railway configuration runs `npm run db:migrate:deploy` before every dev and production
deployment, starts the compiled API with `npm start`, and verifies `/health` before activating the
deployment. Each Railway environment migrates its own `DATABASE_URL`; no dashboard migration command
or manual migration step is required. A migration failure stops the deployment. Destructive database
commands are blocked in production and on Railway. Railway's `development` environment accepts Stripe
test credentials; its `production` environment requires live credentials. The process also drains
HTTP requests and closes its database clients on `SIGTERM`/`SIGINT`.

The initial migration history is one generated baseline intended for a new production database.
Run `npm run db:full` to reset a non-production database to that baseline and load demo data.

## Seed Commands

`npm run seed:demo` is for local demo data only, requires `DEMO_SEED_PASSWORD` with at least 8 characters, and exits with an error in production.

`npm run db:provision:super` provisions the production super admin and requires:

- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `SUPER_ADMIN_FIRST_NAME`
- `SUPER_ADMIN_LAST_NAME`

It does not create a test account unless every `TEST_ADMIN_*` variable is supplied, and it refuses
test-account variables when `NODE_ENV=production`.

For non-production test environments only, the optional variables are:

- `TEST_ADMIN_EMAIL`
- `TEST_ADMIN_PASSWORD`
- `TEST_ADMIN_FIRST_NAME`
- `TEST_ADMIN_LAST_NAME`

## Stripe

Configure Stripe to send `checkout.session.completed` to `POST /api/payments/webhook`. Checkout completion is recorded by unique Stripe session ID, so webhook retries are idempotent. Checkout success and cancel redirects are limited to configured client origins.
