CREATE TABLE "support_message" (
    "id" SERIAL NOT NULL,
    "requester_id" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "email_status" TEXT NOT NULL DEFAULT 'pending',
    "email_id" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_message_requester_id_idx" ON "support_message"("requester_id");
CREATE INDEX "support_message_email_status_idx" ON "support_message"("email_status");
CREATE INDEX "support_message_created_at_idx" ON "support_message"("created_at");

ALTER TABLE "support_message"
ADD CONSTRAINT "support_message_requester_id_fkey"
FOREIGN KEY ("requester_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
