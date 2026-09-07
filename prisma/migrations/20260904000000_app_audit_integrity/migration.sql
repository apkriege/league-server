ALTER TABLE "email_verification_token" ADD COLUMN "pending_email" TEXT;
CREATE TABLE "player_handicap_adjustment" (
  "id" SERIAL PRIMARY KEY,
  "player_id" INTEGER NOT NULL REFERENCES "player"("id"),
  "handicap" DOUBLE PRECISION NOT NULL,
  "effective_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "player_handicap_adjustment_player_id_effective_at_idx"
ON "player_handicap_adjustment"("player_id", "effective_at");
