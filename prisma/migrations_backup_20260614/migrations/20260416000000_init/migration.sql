-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'admin');

-- CreateTable
CREATE TABLE "session" (
    "sid" TEXT NOT NULL,
    "sess" JSONB NOT NULL,
    "expire" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "google_id" TEXT,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "phone" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logo" TEXT,
    "location" TEXT,
    "phone" TEXT,
    "link" TEXT,
    "type" TEXT NOT NULL DEFAULT 'public',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course" (
    "id" SERIAL NOT NULL,
    "club_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "phone" TEXT,
    "type" TEXT NOT NULL DEFAULT 'public',
    "num_holes" INTEGER,
    "par" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tee" (
    "id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "distance" INTEGER NOT NULL,
    "par" INTEGER NOT NULL,
    "front_par" INTEGER NOT NULL,
    "back_par" INTEGER NOT NULL,
    "slope_men" INTEGER NOT NULL,
    "slope_front_men" INTEGER NOT NULL,
    "slope_back_men" INTEGER NOT NULL,
    "slope_women" INTEGER,
    "slope_front_women" INTEGER,
    "slope_back_women" INTEGER,
    "rating_men" DOUBLE PRECISION NOT NULL,
    "rating_front_men" DOUBLE PRECISION NOT NULL,
    "rating_back_men" DOUBLE PRECISION NOT NULL,
    "rating_women" DOUBLE PRECISION,
    "rating_front_women" DOUBLE PRECISION,
    "rating_back_women" DOUBLE PRECISION,
    "holes" JSONB[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "access" TEXT NOT NULL DEFAULT 'public',
    "format" TEXT,
    "num_players" INTEGER NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "contact_first" TEXT NOT NULL,
    "contact_last" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "league_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "handicap" DOUBLE PRECISION NOT NULL,
    "starting_handicap" DOUBLE PRECISION NOT NULL,
    "season_points" DOUBLE PRECISION NOT NULL,
    "season_rank" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'player',
    "league_id" INTEGER,
    "event_id" INTEGER,
    "team_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "league_id" INTEGER,
    "event_id" INTEGER,
    "season_points" DOUBLE PRECISION NOT NULL,
    "season_rank" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" SERIAL NOT NULL,
    "league_id" INTEGER NOT NULL,
    "course_id" INTEGER NOT NULL,
    "tee_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "holes" INTEGER NOT NULL,
    "start_side" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT NOT NULL,
    "interval" INTEGER NOT NULL,
    "scoring_format" TEXT NOT NULL,
    "pts_per_hole" INTEGER,
    "pts_per_match" INTEGER,
    "pts_per_team_win" INTEGER,
    "stroke_points" JSONB,
    "status" TEXT NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_event_points" (
    "id" SERIAL NOT NULL,
    "league_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "event_id" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_event_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "start_time" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "flight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_player" (
    "id" SERIAL NOT NULL,
    "flight_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "team_id" INTEGER,
    "opponent_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "flight_player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_team" (
    "id" SERIAL NOT NULL,
    "flight_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "opponent_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "flight_team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "opponent_id" INTEGER,
    "course_id" INTEGER NOT NULL,
    "tee_id" INTEGER NOT NULL,
    "scoring_format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "holes_played" INTEGER NOT NULL,
    "gross" INTEGER NOT NULL,
    "net" INTEGER NOT NULL,
    "adjusted" INTEGER NOT NULL,
    "putts" INTEGER NOT NULL,
    "course_rating" DOUBLE PRECISION NOT NULL,
    "course_slope" DOUBLE PRECISION NOT NULL,
    "differential" DOUBLE PRECISION,
    "pre_handicap" DOUBLE PRECISION,
    "post_handicap" DOUBLE PRECISION,
    "points_earned" DOUBLE PRECISION NOT NULL,
    "match_points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eagles" INTEGER NOT NULL,
    "birdies" INTEGER NOT NULL,
    "pars" INTEGER NOT NULL,
    "bogeys" INTEGER NOT NULL,
    "double_bogeys" INTEGER NOT NULL,
    "triple_bogeys" INTEGER NOT NULL,
    "net_eagles" INTEGER,
    "net_birdies" INTEGER,
    "net_pars" INTEGER,
    "net_bogeys" INTEGER,
    "net_double_bogeys" INTEGER,
    "net_triple_bogeys" INTEGER,
    "played_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "round_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "course_id" INTEGER NOT NULL,
    "tee_id" INTEGER NOT NULL,
    "hole" INTEGER NOT NULL,
    "par" INTEGER NOT NULL,
    "gross" INTEGER NOT NULL,
    "net" INTEGER NOT NULL,
    "adjusted" INTEGER NOT NULL,
    "putts" INTEGER,
    "fairway_hit" BOOLEAN,
    "gir" BOOLEAN,
    "sand_save" BOOLEAN,
    "penalty_strokes" INTEGER,
    "pops_received" INTEGER,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_expire_idx" ON "session"("expire");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_google_id_key" ON "user"("google_id");

-- CreateIndex
CREATE INDEX "user_email_idx" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_deleted_at_idx" ON "user"("deleted_at");

-- CreateIndex
CREATE INDEX "club_deleted_at_idx" ON "club"("deleted_at");

-- CreateIndex
CREATE INDEX "course_club_id_idx" ON "course"("club_id");

-- CreateIndex
CREATE INDEX "course_deleted_at_idx" ON "course"("deleted_at");

-- CreateIndex
CREATE INDEX "tee_course_id_idx" ON "tee"("course_id");

-- CreateIndex
CREATE INDEX "tee_deleted_at_idx" ON "tee"("deleted_at");

-- CreateIndex
CREATE INDEX "league_admin_id_idx" ON "league"("admin_id");

-- CreateIndex
CREATE INDEX "league_start_date_idx" ON "league"("start_date");

-- CreateIndex
CREATE INDEX "league_deleted_at_idx" ON "league"("deleted_at");

-- CreateIndex
CREATE INDEX "player_league_id_idx" ON "player"("league_id");

-- CreateIndex
CREATE INDEX "player_event_id_idx" ON "player"("event_id");

-- CreateIndex
CREATE INDEX "player_team_id_idx" ON "player"("team_id");

-- CreateIndex
CREATE INDEX "player_email_idx" ON "player"("email");

-- CreateIndex
CREATE INDEX "player_deleted_at_idx" ON "player"("deleted_at");

-- CreateIndex
CREATE INDEX "team_league_id_idx" ON "team"("league_id");

-- CreateIndex
CREATE INDEX "team_event_id_idx" ON "team"("event_id");

-- CreateIndex
CREATE INDEX "team_deleted_at_idx" ON "team"("deleted_at");

-- CreateIndex
CREATE INDEX "event_league_id_idx" ON "event"("league_id");

-- CreateIndex
CREATE INDEX "event_course_id_idx" ON "event"("course_id");

-- CreateIndex
CREATE INDEX "event_tee_id_idx" ON "event"("tee_id");

-- CreateIndex
CREATE INDEX "event_date_idx" ON "event"("date");

-- CreateIndex
CREATE INDEX "event_status_idx" ON "event"("status");

-- CreateIndex
CREATE INDEX "event_deleted_at_idx" ON "event"("deleted_at");

-- CreateIndex
CREATE INDEX "team_event_points_league_id_event_id_idx" ON "team_event_points"("league_id", "event_id");

-- CreateIndex
CREATE INDEX "team_event_points_team_id_idx" ON "team_event_points"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_event_points_team_id_event_id_key" ON "team_event_points"("team_id", "event_id");

-- CreateIndex
CREATE INDEX "flight_event_id_idx" ON "flight"("event_id");

-- CreateIndex
CREATE INDEX "flight_deleted_at_idx" ON "flight"("deleted_at");

-- CreateIndex
CREATE INDEX "flight_player_flight_id_idx" ON "flight_player"("flight_id");

-- CreateIndex
CREATE INDEX "flight_player_player_id_idx" ON "flight_player"("player_id");

-- CreateIndex
CREATE INDEX "flight_player_opponent_id_idx" ON "flight_player"("opponent_id");

-- CreateIndex
CREATE INDEX "flight_player_deleted_at_idx" ON "flight_player"("deleted_at");

-- CreateIndex
CREATE INDEX "flight_team_flight_id_idx" ON "flight_team"("flight_id");

-- CreateIndex
CREATE INDEX "flight_team_team_id_idx" ON "flight_team"("team_id");

-- CreateIndex
CREATE INDEX "flight_team_opponent_id_idx" ON "flight_team"("opponent_id");

-- CreateIndex
CREATE INDEX "flight_team_deleted_at_idx" ON "flight_team"("deleted_at");

-- CreateIndex
CREATE INDEX "round_event_id_idx" ON "round"("event_id");

-- CreateIndex
CREATE INDEX "round_player_id_idx" ON "round"("player_id");

-- CreateIndex
CREATE INDEX "round_opponent_id_idx" ON "round"("opponent_id");

-- CreateIndex
CREATE INDEX "round_course_id_idx" ON "round"("course_id");

-- CreateIndex
CREATE INDEX "round_tee_id_idx" ON "round"("tee_id");

-- CreateIndex
CREATE INDEX "round_deleted_at_idx" ON "round"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "round_event_id_player_id_key" ON "round"("event_id", "player_id");

-- CreateIndex
CREATE INDEX "score_event_id_idx" ON "score"("event_id");

-- CreateIndex
CREATE INDEX "score_round_id_idx" ON "score"("round_id");

-- CreateIndex
CREATE INDEX "score_player_id_idx" ON "score"("player_id");

-- CreateIndex
CREATE INDEX "score_course_id_idx" ON "score"("course_id");

-- CreateIndex
CREATE INDEX "score_tee_id_idx" ON "score"("tee_id");

-- CreateIndex
CREATE INDEX "score_hole_idx" ON "score"("hole");

-- CreateIndex
CREATE UNIQUE INDEX "score_round_id_hole_key" ON "score"("round_id", "hole");

-- AddForeignKey
ALTER TABLE "course" ADD CONSTRAINT "course_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tee" ADD CONSTRAINT "tee_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league" ADD CONSTRAINT "league_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player" ADD CONSTRAINT "player_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player" ADD CONSTRAINT "player_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player" ADD CONSTRAINT "player_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player" ADD CONSTRAINT "player_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "tee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event_points" ADD CONSTRAINT "team_event_points_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event_points" ADD CONSTRAINT "team_event_points_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event_points" ADD CONSTRAINT "team_event_points_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight" ADD CONSTRAINT "flight_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_player" ADD CONSTRAINT "flight_player_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_player" ADD CONSTRAINT "flight_player_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_team" ADD CONSTRAINT "flight_team_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_team" ADD CONSTRAINT "flight_team_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round" ADD CONSTRAINT "round_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round" ADD CONSTRAINT "round_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round" ADD CONSTRAINT "round_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round" ADD CONSTRAINT "round_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round" ADD CONSTRAINT "round_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "tee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score" ADD CONSTRAINT "score_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score" ADD CONSTRAINT "score_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score" ADD CONSTRAINT "score_tee_id_fkey" FOREIGN KEY ("tee_id") REFERENCES "tee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
