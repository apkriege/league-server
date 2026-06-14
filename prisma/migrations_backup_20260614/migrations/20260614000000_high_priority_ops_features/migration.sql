CREATE TABLE "league_invitation" (
    "id" SERIAL NOT NULL,
    "league_id" INTEGER NOT NULL,
    "player_id" INTEGER,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invited_by_id" INTEGER NOT NULL,
    "claimed_by_id" INTEGER,
    "expires_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "league_invitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "league_id" INTEGER,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "league_id" INTEGER,
    "entity" TEXT NOT NULL,
    "entity_id" INTEGER,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "league_onboarding" (
    "id" SERIAL NOT NULL,
    "league_id" INTEGER NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "players_reviewed_at" TIMESTAMP(3),
    "teams_reviewed_at" TIMESTAMP(3),
    "first_event_created_at" TIMESTAMP(3),
    "scorecards_printed_at" TIMESTAMP(3),
    "first_scores_entered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "league_onboarding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "league_invitation_token_key" ON "league_invitation"("token");
CREATE INDEX "league_invitation_league_id_idx" ON "league_invitation"("league_id");
CREATE INDEX "league_invitation_player_id_idx" ON "league_invitation"("player_id");
CREATE INDEX "league_invitation_email_idx" ON "league_invitation"("email");
CREATE INDEX "league_invitation_status_idx" ON "league_invitation"("status");
CREATE INDEX "league_invitation_deleted_at_idx" ON "league_invitation"("deleted_at");

CREATE INDEX "notification_user_id_idx" ON "notification"("user_id");
CREATE INDEX "notification_league_id_idx" ON "notification"("league_id");
CREATE INDEX "notification_read_at_idx" ON "notification"("read_at");
CREATE INDEX "notification_deleted_at_idx" ON "notification"("deleted_at");

CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");
CREATE INDEX "audit_log_league_id_idx" ON "audit_log"("league_id");
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

CREATE UNIQUE INDEX "league_onboarding_league_id_key" ON "league_onboarding"("league_id");

ALTER TABLE "league_invitation" ADD CONSTRAINT "league_invitation_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "league_invitation" ADD CONSTRAINT "league_invitation_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "league_invitation" ADD CONSTRAINT "league_invitation_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "league_invitation" ADD CONSTRAINT "league_invitation_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification" ADD CONSTRAINT "notification_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "league_onboarding" ADD CONSTRAINT "league_onboarding_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
