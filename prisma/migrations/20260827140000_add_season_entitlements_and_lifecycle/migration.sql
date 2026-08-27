CREATE TABLE "league_season_entitlement" (
  "id" SERIAL NOT NULL,
  "billing_owner_id" INTEGER NOT NULL,
  "draft_key" TEXT NOT NULL,
  "renewed_from_league_id" INTEGER,
  "required_golfers" INTEGER NOT NULL,
  "paid_golfers" INTEGER NOT NULL DEFAULT 0,
  "refunded_golfers" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending_payment',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "league_season_entitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "league_season_entitlement_quantities_valid" CHECK (
    "required_golfers" > 0
    AND "paid_golfers" >= 0
    AND "refunded_golfers" >= 0
    AND "refunded_golfers" <= "paid_golfers"
  ),
  CONSTRAINT "league_season_entitlement_status_valid" CHECK (
    "status" IN ('pending_payment', 'paid', 'consumed', 'partially_refunded', 'refunded', 'bypassed')
  )
);

CREATE UNIQUE INDEX "league_season_entitlement_billing_owner_id_draft_key_key"
ON "league_season_entitlement"("billing_owner_id", "draft_key");
CREATE INDEX "league_season_entitlement_billing_owner_id_idx"
ON "league_season_entitlement"("billing_owner_id");
CREATE INDEX "league_season_entitlement_renewed_from_league_id_idx"
ON "league_season_entitlement"("renewed_from_league_id");
CREATE INDEX "league_season_entitlement_status_idx"
ON "league_season_entitlement"("status");

ALTER TABLE "league_season_entitlement"
ADD CONSTRAINT "league_season_entitlement_billing_owner_id_fkey"
FOREIGN KEY ("billing_owner_id") REFERENCES "user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "league"
ADD COLUMN "entitlement_id" INTEGER,
ADD COLUMN "billing_status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "season_status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "archived_at" TIMESTAMPTZ(3),
ADD COLUMN "renewal_reminder_sent_at" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "league_entitlement_id_key" ON "league"("entitlement_id");
CREATE INDEX "league_entitlement_id_idx" ON "league"("entitlement_id");
CREATE INDEX "league_season_status_idx" ON "league"("season_status");
CREATE INDEX "league_billing_status_idx" ON "league"("billing_status");

ALTER TABLE "league"
ADD CONSTRAINT "league_entitlement_id_fkey"
FOREIGN KEY ("entitlement_id") REFERENCES "league_season_entitlement"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "league"
ADD CONSTRAINT "league_billing_status_valid"
CHECK ("billing_status" IN ('active', 'exempt', 'payment_due')),
ADD CONSTRAINT "league_season_status_valid"
CHECK ("season_status" IN ('active', 'archived', 'reopened'));

-- Every existing season gets its own immutable billing entitlement. This also
-- preserves deleted historical seasons without returning their seats to a pool.
INSERT INTO "league_season_entitlement" (
  "billing_owner_id",
  "draft_key",
  "renewed_from_league_id",
  "required_golfers",
  "paid_golfers",
  "status"
)
SELECT
  "admin_id",
  'legacy-league-' || "id",
  "renewed_from_league_id",
  GREATEST(1, "num_players"),
  CASE WHEN "billing_exempt" THEN 0 ELSE GREATEST(0, "billing_paid_golfers") END,
  CASE WHEN "billing_exempt" THEN 'bypassed' ELSE 'consumed' END
FROM "league";

UPDATE "league" AS league_row
SET
  "entitlement_id" = entitlement."id",
  "billing_status" = CASE WHEN league_row."billing_exempt" THEN 'exempt' ELSE 'active' END,
  "season_status" = CASE
    WHEN league_row."type" = 'season' AND league_row."end_date" < CURRENT_DATE THEN 'archived'
    ELSE 'active'
  END,
  "archived_at" = CASE
    WHEN league_row."type" = 'season' AND league_row."end_date" < CURRENT_DATE THEN CURRENT_TIMESTAMP
    ELSE NULL
  END
FROM "league_season_entitlement" AS entitlement
WHERE entitlement."draft_key" = 'legacy-league-' || league_row."id";

ALTER TABLE "stripe_checkout_completion"
ADD COLUMN "entitlement_id" INTEGER;

CREATE INDEX "stripe_checkout_completion_entitlement_id_idx"
ON "stripe_checkout_completion"("entitlement_id");

ALTER TABLE "stripe_checkout_completion"
ADD CONSTRAINT "stripe_checkout_completion_entitlement_id_fkey"
FOREIGN KEY ("entitlement_id") REFERENCES "league_season_entitlement"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "stripe_checkout_completion" AS completion
SET "entitlement_id" = league_row."entitlement_id"
FROM "league" AS league_row
WHERE completion."league_id" = league_row."id";
