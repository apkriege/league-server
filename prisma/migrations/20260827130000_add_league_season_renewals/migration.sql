ALTER TABLE "league"
ADD COLUMN "renewed_from_league_id" INTEGER,
ADD COLUMN "billing_paid_golfers" INTEGER NOT NULL DEFAULT 0;

-- Active existing leagues already consumed their roster purchase. Legacy leagues
-- deleted before this migration are not charged retroactively; new leagues retain
-- their entitlement even if they are deleted later.
UPDATE "league"
SET "billing_paid_golfers" = "num_players"
WHERE "billing_exempt" = FALSE AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "league_renewed_from_league_id_key"
ON "league"("renewed_from_league_id");

CREATE INDEX "league_renewed_from_league_id_idx"
ON "league"("renewed_from_league_id");

ALTER TABLE "league"
ADD CONSTRAINT "league_renewed_from_league_id_fkey"
FOREIGN KEY ("renewed_from_league_id") REFERENCES "league"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "league"
ADD CONSTRAINT "league_billing_paid_golfers_nonnegative"
CHECK ("billing_paid_golfers" >= 0);
