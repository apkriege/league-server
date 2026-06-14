-- Ensure half-point scoring persists without integer rounding.
ALTER TABLE "round"
  ALTER COLUMN "points_earned" TYPE DOUBLE PRECISION USING ("points_earned"::double precision),
  ALTER COLUMN "points_earned" SET DEFAULT 0,
  ALTER COLUMN "match_points" TYPE DOUBLE PRECISION USING ("match_points"::double precision),
  ALTER COLUMN "match_points" SET DEFAULT 0;

ALTER TABLE "player"
  ALTER COLUMN "season_points" TYPE DOUBLE PRECISION USING ("season_points"::double precision),
  ALTER COLUMN "season_points" SET DEFAULT 0;

ALTER TABLE "team"
  ALTER COLUMN "season_points" TYPE DOUBLE PRECISION USING ("season_points"::double precision),
  ALTER COLUMN "season_points" SET DEFAULT 0;

ALTER TABLE "team_event_points"
  ALTER COLUMN "points" TYPE DOUBLE PRECISION USING ("points"::double precision),
  ALTER COLUMN "points" SET DEFAULT 0;
