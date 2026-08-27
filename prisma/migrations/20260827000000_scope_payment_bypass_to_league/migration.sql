ALTER TABLE "league"
ADD COLUMN "billing_exempt" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "payment_bypass_code"
ADD COLUMN "redeemed_league_id" INTEGER;

CREATE UNIQUE INDEX "payment_bypass_code_redeemed_league_id_key"
ON "payment_bypass_code"("redeemed_league_id");

ALTER TABLE "payment_bypass_code"
ADD CONSTRAINT "payment_bypass_code_redeemed_league_id_fkey"
FOREIGN KEY ("redeemed_league_id") REFERENCES "league"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Pair existing redeemed codes with the user's existing leagues in redemption/creation order.
WITH ranked_codes AS (
  SELECT
    "id",
    "redeemed_by_id",
    ROW_NUMBER() OVER (
      PARTITION BY "redeemed_by_id"
      ORDER BY "redeemed_at", "id"
    ) AS position
  FROM "payment_bypass_code"
  WHERE "redeemed_at" IS NOT NULL AND "redeemed_by_id" IS NOT NULL
),
ranked_leagues AS (
  SELECT
    "id",
    "admin_id",
    ROW_NUMBER() OVER (
      PARTITION BY "admin_id"
      ORDER BY "created_at", "id"
    ) AS position
  FROM "league"
  WHERE "deleted_at" IS NULL
),
assignments AS (
  SELECT codes."id" AS code_id, leagues."id" AS league_id
  FROM ranked_codes codes
  INNER JOIN ranked_leagues leagues
    ON leagues."admin_id" = codes."redeemed_by_id"
   AND leagues.position = codes.position
)
UPDATE "payment_bypass_code" codes
SET "redeemed_league_id" = assignments.league_id
FROM assignments
WHERE codes."id" = assignments.code_id;

UPDATE "league" leagues
SET "billing_exempt" = true
WHERE EXISTS (
  SELECT 1
  FROM "payment_bypass_code" codes
  WHERE codes."redeemed_league_id" = leagues."id"
);

-- Account-wide exemptions are no longer honored. Preserve an unassigned redeemed code as the
-- user's pending entitlement for their next league before removing the legacy metadata fields.
UPDATE "user"
SET "metadata" = jsonb_set(
  COALESCE("metadata", '{}'::jsonb),
  '{billing}',
  COALESCE("metadata"->'billing', '{}'::jsonb)
    - 'paymentExempt'
    - 'paymentExemptAt'
    - 'paymentExemptCodeId',
  true
)
WHERE COALESCE("metadata"->'billing', '{}'::jsonb) ?| ARRAY[
  'paymentExempt',
  'paymentExemptAt',
  'paymentExemptCodeId'
];

WITH pending_codes AS (
  SELECT DISTINCT ON ("redeemed_by_id")
    "redeemed_by_id",
    "id"
  FROM "payment_bypass_code"
  WHERE
    "redeemed_by_id" IS NOT NULL
    AND "redeemed_at" IS NOT NULL
    AND "redeemed_league_id" IS NULL
  ORDER BY "redeemed_by_id", "redeemed_at" DESC, "id" DESC
)
UPDATE "user" users
SET "metadata" = jsonb_set(
  jsonb_set(
    COALESCE(users."metadata", '{}'::jsonb),
    '{billing}',
    COALESCE(users."metadata"->'billing', '{}'::jsonb),
    true
  ),
  '{billing,pendingLeagueBypassCodeId}',
  to_jsonb(pending_codes."id"),
  true
)
FROM pending_codes
WHERE users."id" = pending_codes."redeemed_by_id";
