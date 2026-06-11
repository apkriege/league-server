# Server

## Required environment variables

Copy `.env.example` to `.env` and set:

- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `CLIENT_URL`
- `SESSION_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Optional:

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

1. Run `npm run build`.
2. Apply reviewed Prisma migrations.
3. Run `npm run start:prod`.
4. Configure the Stripe webhook to `POST /api/payments/webhook`.

## Notes

- Session auth requires a shared `SESSION_SECRET`.
- `CLIENT_URL` must match the frontend origin for CORS and checkout redirects.
- Google sign-in is not enabled unless the OAuth env vars and routes are configured.
