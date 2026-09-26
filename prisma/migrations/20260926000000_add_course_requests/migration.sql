CREATE TABLE "course_request" (
  "id" SERIAL NOT NULL,
  "requester_id" INTEGER NOT NULL,
  "request_type" TEXT NOT NULL,
  "course_name" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "external_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "email_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(3),
  CONSTRAINT "course_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "course_request_status_created_at_idx" ON "course_request"("status", "created_at");
CREATE INDEX "course_request_requester_id_idx" ON "course_request"("requester_id");
ALTER TABLE "course_request" ADD CONSTRAINT "course_request_requester_id_fkey"
  FOREIGN KEY ("requester_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
