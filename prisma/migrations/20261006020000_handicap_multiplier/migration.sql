ALTER TABLE "league" ADD COLUMN "handicap_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "league" ADD CONSTRAINT "league_handicap_multiplier_check" CHECK ("handicap_multiplier" >= 0.01 AND "handicap_multiplier" <= 1);
