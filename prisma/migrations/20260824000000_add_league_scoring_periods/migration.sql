CREATE TABLE "league_scoring_period" (
    "id" SERIAL NOT NULL,
    "league_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_scoring_period_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "league_scoring_period_league_id_position_key"
ON "league_scoring_period"("league_id", "position");
CREATE INDEX "league_scoring_period_league_id_idx" ON "league_scoring_period"("league_id");
CREATE INDEX "league_scoring_period_start_date_idx" ON "league_scoring_period"("start_date");
CREATE INDEX "league_scoring_period_end_date_idx" ON "league_scoring_period"("end_date");

ALTER TABLE "league_scoring_period"
ADD CONSTRAINT "league_scoring_period_league_id_fkey"
FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE CASCADE;
