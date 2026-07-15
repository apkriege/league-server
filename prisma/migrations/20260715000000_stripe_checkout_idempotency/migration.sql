CREATE TABLE "stripe_checkout_completion" (
    "id" SERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "target_golfers" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_checkout_completion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stripe_checkout_completion_session_id_key"
    ON "stripe_checkout_completion"("session_id");

CREATE INDEX "stripe_checkout_completion_user_id_idx"
    ON "stripe_checkout_completion"("user_id");
