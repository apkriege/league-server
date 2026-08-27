ALTER TABLE "user"
ADD COLUMN "email_verified_at" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP;

UPDATE "user"
SET "email_verified_at" = COALESCE("created_at", CURRENT_TIMESTAMP);

CREATE TABLE "email_verification_token" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "redirect_path" TEXT NOT NULL DEFAULT '/leagues/create',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_verification_token_token_hash_key"
ON "email_verification_token"("token_hash");

CREATE INDEX "email_verification_token_user_id_idx"
ON "email_verification_token"("user_id");

CREATE INDEX "email_verification_token_expires_at_idx"
ON "email_verification_token"("expires_at");

ALTER TABLE "email_verification_token"
ADD CONSTRAINT "email_verification_token_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
