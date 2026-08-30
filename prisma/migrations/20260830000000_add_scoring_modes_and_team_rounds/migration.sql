ALTER TABLE "event"
ADD COLUMN "scoring_mode" TEXT,
ADD COLUMN "scoring_config" JSONB;

UPDATE "event"
SET "scoring_mode" = CASE
  WHEN LOWER("format") = 'team' AND LOWER("scoring_format") = 'stroke' THEN 'best-ball'
  WHEN LOWER("scoring_format") = 'match' THEN 'match-play'
  ELSE 'stroke-play'
END;

ALTER TABLE "event"
ALTER COLUMN "scoring_mode" SET NOT NULL,
ALTER COLUMN "scoring_mode" SET DEFAULT 'stroke-play';

ALTER TABLE "event"
ADD CONSTRAINT "event_scoring_mode_check"
CHECK ("scoring_mode" IN ('stroke-play', 'match-play', 'stableford', 'maximum-score', 'best-ball', 'four-ball-match', 'scramble', 'alternate-shot'));

CREATE TABLE "team_round" (
  "id" SERIAL NOT NULL,
  "event_id" INTEGER NOT NULL,
  "flight_id" INTEGER,
  "team_id" INTEGER NOT NULL,
  "course_id" INTEGER NOT NULL,
  "tee_id" INTEGER NOT NULL,
  "scoring_mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'not_started',
  "holes_played" INTEGER NOT NULL,
  "gross" INTEGER NOT NULL,
  "net" INTEGER NOT NULL,
  "adjusted" INTEGER NOT NULL,
  "course_handicap" INTEGER,
  "handicap_allowance" DOUBLE PRECISION,
  "handicap_snapshot" JSONB,
  "points_earned" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "match_points" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "played_date" DATE NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(3),

  CONSTRAINT "team_round_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_round_scoring_mode_check" CHECK ("scoring_mode" IN ('stroke-play', 'match-play', 'stableford', 'maximum-score', 'best-ball', 'four-ball-match', 'scramble', 'alternate-shot')),
  CONSTRAINT "team_round_status_check" CHECK ("status" IN ('not_started', 'in_progress', 'completed')),
  CONSTRAINT "team_round_totals_check" CHECK ("holes_played" >= 0 AND "gross" >= 0 AND "net" >= 0 AND "adjusted" >= 0),
  CONSTRAINT "team_round_handicap_allowance_check" CHECK ("handicap_allowance" IS NULL OR ("handicap_allowance" >= 0 AND "handicap_allowance" <= 1))
);

CREATE TABLE "team_score" (
  "id" SERIAL NOT NULL,
  "team_round_id" INTEGER NOT NULL,
  "hole" INTEGER NOT NULL,
  "par" INTEGER NOT NULL,
  "gross" INTEGER NOT NULL,
  "net" INTEGER NOT NULL,
  "adjusted" INTEGER NOT NULL,
  "pops_received" INTEGER,
  "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "team_score_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_score_values_check" CHECK ("hole" > 0 AND "par" > 0 AND "gross" > 0 AND "net" >= 0 AND "adjusted" > 0)
);

CREATE UNIQUE INDEX "team_round_event_id_team_id_key" ON "team_round"("event_id", "team_id");
CREATE INDEX "team_round_event_id_idx" ON "team_round"("event_id");
CREATE INDEX "team_round_flight_id_idx" ON "team_round"("flight_id");
CREATE INDEX "team_round_team_id_idx" ON "team_round"("team_id");
CREATE INDEX "team_round_course_id_idx" ON "team_round"("course_id");
CREATE INDEX "team_round_tee_id_idx" ON "team_round"("tee_id");
CREATE INDEX "team_round_status_idx" ON "team_round"("status");
CREATE INDEX "team_round_deleted_at_idx" ON "team_round"("deleted_at");
CREATE UNIQUE INDEX "team_score_team_round_id_hole_key" ON "team_score"("team_round_id", "hole");
CREATE INDEX "team_score_hole_idx" ON "team_score"("hole");

ALTER TABLE "team_round"
ADD CONSTRAINT "team_round_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "team_round"
ADD CONSTRAINT "team_round_flight_id_fkey"
FOREIGN KEY ("flight_id") REFERENCES "flight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "team_round"
ADD CONSTRAINT "team_round_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "team_round"
ADD CONSTRAINT "team_round_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "team_round"
ADD CONSTRAINT "team_round_tee_id_fkey"
FOREIGN KEY ("tee_id") REFERENCES "tee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "team_score"
ADD CONSTRAINT "team_score_team_round_id_fkey"
FOREIGN KEY ("team_round_id") REFERENCES "team_round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
