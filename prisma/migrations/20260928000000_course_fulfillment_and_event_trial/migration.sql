ALTER TABLE "user" ADD COLUMN "trial_claimed_at" TIMESTAMPTZ(3);

ALTER TABLE "league_season_entitlement" DROP CONSTRAINT "league_season_entitlement_status_valid";
ALTER TABLE "league_season_entitlement" ADD CONSTRAINT "league_season_entitlement_status_valid"
  CHECK ("status" IN ('pending_payment', 'paid', 'consumed', 'partially_refunded', 'refunded', 'bypassed', 'trialing'));

ALTER TABLE "league_season_entitlement"
  ADD COLUMN "trial_event_limit" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "trial_event_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "trial_scored_event" (
  "entitlement_id" INTEGER NOT NULL,
  "event_id" INTEGER NOT NULL,
  "first_scored_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trial_scored_event_pkey" PRIMARY KEY ("entitlement_id", "event_id")
);
CREATE INDEX "trial_scored_event_event_id_idx" ON "trial_scored_event"("event_id");
ALTER TABLE "trial_scored_event" ADD CONSTRAINT "trial_scored_event_entitlement_id_fkey"
  FOREIGN KEY ("entitlement_id") REFERENCES "league_season_entitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trial_scored_event" ADD CONSTRAINT "trial_scored_event_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "course_request"
  ADD COLUMN "fulfilled_course_id" INTEGER,
  ADD COLUMN "resolved_by_id" INTEGER,
  ADD COLUMN "resolution_note" TEXT,
  ADD COLUMN "notification_status" TEXT NOT NULL DEFAULT 'pending';
UPDATE "course_request" SET "status" = 'pending', "resolved_at" = NULL WHERE "status" = 'resolved';
CREATE INDEX "course_request_fulfilled_course_id_idx" ON "course_request"("fulfilled_course_id");
ALTER TABLE "course_request" ADD CONSTRAINT "course_request_fulfilled_course_id_fkey"
  FOREIGN KEY ("fulfilled_course_id") REFERENCES "course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "course_request" ADD CONSTRAINT "course_request_resolved_by_id_fkey"
  FOREIGN KEY ("resolved_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
