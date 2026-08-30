ALTER TABLE "event" DROP COLUMN "scoring_format";
ALTER TABLE "round" DROP COLUMN "scoring_format";

-- Backfill the entitlement as the single source of league capacity and billing state.
INSERT INTO "league_season_entitlement" (
  "billing_owner_id", "draft_key", "renewed_from_league_id", "required_golfers",
  "paid_golfers", "refunded_golfers", "status", "created_at", "updated_at"
)
SELECT
  l."admin_id", 'legacy-league-' || l."id", l."renewed_from_league_id", GREATEST(1, l."num_players"),
  CASE WHEN l."billing_exempt" THEN 0 ELSE l."billing_paid_golfers" END,
  CASE
    WHEN NOT l."billing_exempt" AND l."billing_status" = 'payment_due' THEN
      GREATEST(0, l."billing_paid_golfers" - GREATEST(1, l."num_players") + 1)
    ELSE 0
  END,
  CASE
    WHEN l."billing_exempt" THEN 'bypassed'
    WHEN l."billing_status" = 'payment_due' THEN 'partially_refunded'
    ELSE 'consumed'
  END,
  l."created_at", CURRENT_TIMESTAMP
FROM "league" l
WHERE l."entitlement_id" IS NULL;

UPDATE "league" l
SET "entitlement_id" = e."id"
FROM "league_season_entitlement" e
WHERE l."entitlement_id" IS NULL
  AND e."billing_owner_id" = l."admin_id"
  AND e."draft_key" = 'legacy-league-' || l."id";

UPDATE "league_season_entitlement" e
SET
  "required_golfers" = GREATEST(e."required_golfers", l."num_players", 1),
  "paid_golfers" = CASE WHEN l."billing_exempt" THEN e."paid_golfers" ELSE GREATEST(e."paid_golfers", l."billing_paid_golfers") END,
  "refunded_golfers" = CASE
    WHEN NOT l."billing_exempt" AND l."billing_status" = 'payment_due' THEN
      GREATEST(
        e."refunded_golfers",
        0,
        GREATEST(e."paid_golfers", l."billing_paid_golfers")
          - GREATEST(e."required_golfers", l."num_players", 1) + 1
      )
    ELSE e."refunded_golfers"
  END,
  "status" = CASE
    WHEN l."billing_exempt" THEN 'bypassed'
    WHEN l."billing_status" = 'payment_due' THEN 'partially_refunded'
    ELSE e."status"
  END,
  "updated_at" = CURRENT_TIMESTAMP
FROM "league" l
WHERE l."entitlement_id" = e."id";

ALTER TABLE "league"
  ALTER COLUMN "entitlement_id" SET NOT NULL,
  DROP COLUMN "num_players",
  DROP COLUMN "billing_paid_golfers",
  DROP COLUMN "billing_exempt",
  DROP COLUMN "billing_status";

ALTER TABLE "event"
  DROP COLUMN "isComplete",
  DROP COLUMN "is_deleted";

ALTER TABLE "team_round" DROP COLUMN "scoring_mode";

ALTER TABLE "player" DROP COLUMN "event_id";
ALTER TABLE "team" DROP COLUMN "event_id";

ALTER TABLE "score"
  DROP COLUMN "event_id",
  DROP COLUMN "player_id",
  DROP COLUMN "course_id",
  DROP COLUMN "tee_id";
