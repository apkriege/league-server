CREATE TABLE "event_route_segment" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "course_id" INTEGER NOT NULL,
    "tee_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_route_segment_pkey" PRIMARY KEY ("id")
);

DROP INDEX IF EXISTS "course_usga_course_id_key";
CREATE INDEX "course_usga_course_id_idx" ON "course"("usga_course_id");

CREATE UNIQUE INDEX "event_route_segment_event_id_position_key"
ON "event_route_segment"("event_id", "position");
CREATE INDEX "event_route_segment_course_id_idx" ON "event_route_segment"("course_id");
CREATE INDEX "event_route_segment_tee_id_idx" ON "event_route_segment"("tee_id");

ALTER TABLE "event_route_segment"
ADD CONSTRAINT "event_route_segment_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_route_segment"
ADD CONSTRAINT "event_route_segment_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_route_segment"
ADD CONSTRAINT "event_route_segment_tee_id_fkey"
FOREIGN KEY ("tee_id") REFERENCES "tee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
