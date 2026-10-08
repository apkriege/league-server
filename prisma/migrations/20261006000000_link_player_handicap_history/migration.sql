ALTER TABLE "player" ADD COLUMN "renewed_from_player_id" INTEGER;
CREATE UNIQUE INDEX "player_renewed_from_player_id_key" ON "player"("renewed_from_player_id");
ALTER TABLE "player" ADD CONSTRAINT "player_renewed_from_player_id_fkey"
FOREIGN KEY ("renewed_from_player_id") REFERENCES "player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
