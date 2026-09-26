ALTER TABLE "league"
ADD COLUMN "team_roster_size" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN "team_players_per_event" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "event"
ADD COLUMN "team_players_per_event" INTEGER;

ALTER TABLE "league"
ADD CONSTRAINT "league_team_roster_size_check"
CHECK ("team_roster_size" BETWEEN 1 AND 4),
ADD CONSTRAINT "league_team_players_per_event_check"
CHECK ("team_players_per_event" BETWEEN 1 AND 4 AND "team_players_per_event" <= "team_roster_size");

ALTER TABLE "event"
ADD CONSTRAINT "event_team_players_per_event_check"
CHECK ("team_players_per_event" IS NULL OR "team_players_per_event" BETWEEN 1 AND 4);
