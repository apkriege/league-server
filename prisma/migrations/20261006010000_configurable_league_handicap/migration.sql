ALTER TABLE "league"
  ADD COLUMN "handicap_best_rounds" INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN "handicap_window" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "handicap_hole_basis" INTEGER NOT NULL DEFAULT 18,
  ADD COLUMN "handicap_hole_limit" TEXT NOT NULL DEFAULT 'handicap-adjusted';

UPDATE "league" SET "handicap_hole_basis" = 9 WHERE "hole_format" = '9';

ALTER TABLE "league" ADD CONSTRAINT "league_handicap_settings_check" CHECK (
  "handicap_best_rounds" >= 4 AND "handicap_best_rounds" <= "handicap_window" AND "handicap_window" <= 20
  AND "handicap_hole_basis" IN (9, 18)
  AND "handicap_hole_limit" IN ('par-plus-1', 'par-plus-2', 'par-plus-3', 'par-plus-4', 'par-plus-5', 'none', 'handicap-adjusted')
);

ALTER TABLE "player" ALTER COLUMN "handicap" DROP NOT NULL;
ALTER TABLE "player" ALTER COLUMN "starting_handicap" DROP NOT NULL;
ALTER TABLE "event" ADD COLUMN "legacy_scoring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "round" ADD COLUMN "scoring_handicap" DOUBLE PRECISION;
UPDATE "round" SET "scoring_handicap" = "pre_handicap";

UPDATE "event" SET "legacy_scoring" = true
WHERE EXISTS (SELECT 1 FROM "round" WHERE "round"."event_id" = "event"."id")
   OR EXISTS (SELECT 1 FROM "team_round" WHERE "team_round"."event_id" = "event"."id");
