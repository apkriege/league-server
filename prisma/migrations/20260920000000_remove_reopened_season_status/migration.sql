UPDATE "league"
SET "season_status" = 'archived',
    "archived_at" = COALESCE("archived_at", NOW())
WHERE "season_status" = 'reopened';

ALTER TABLE "league"
DROP CONSTRAINT IF EXISTS "league_season_status_valid";
