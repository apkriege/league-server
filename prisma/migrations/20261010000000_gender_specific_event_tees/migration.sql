BEGIN;

ALTER TABLE "event" RENAME COLUMN "tee_id" TO "men_tee_id";
ALTER TABLE "event" RENAME CONSTRAINT "event_tee_id_fkey" TO "event_men_tee_id_fkey";
ALTER INDEX "event_tee_id_idx" RENAME TO "event_men_tee_id_idx";
ALTER TABLE "event" ADD COLUMN "women_tee_id" INTEGER;

ALTER TABLE "event_route_segment" RENAME COLUMN "tee_id" TO "men_tee_id";
ALTER TABLE "event_route_segment" RENAME CONSTRAINT "event_route_segment_tee_id_fkey" TO "event_route_segment_men_tee_id_fkey";
ALTER INDEX "event_route_segment_tee_id_idx" RENAME TO "event_route_segment_men_tee_id_idx";
ALTER TABLE "event_route_segment" ADD COLUMN "women_tee_id" INTEGER;

UPDATE "event" AS e
SET "women_tee_id" = t."id"
FROM "tee" AS t
WHERE t."id" = (e."route_snapshot" #>> '{segments,0,womenTeeId}')::INTEGER
  AND t."course_id" = e."course_id";

UPDATE "event_route_segment" AS r
SET "women_tee_id" = t."id"
FROM "event" AS e,
  LATERAL jsonb_array_elements(COALESCE(e."route_snapshot" -> 'segments', '[]'::JSONB)) WITH ORDINALITY AS s(segment, ordinal),
  "tee" AS t
WHERE r."event_id" = e."id"
  AND r."position" = COALESCE((s.segment ->> 'position')::INTEGER, s.ordinal::INTEGER - 1)
  AND t."id" = (s.segment ->> 'womenTeeId')::INTEGER
  AND t."course_id" = r."course_id";

CREATE INDEX "event_women_tee_id_idx" ON "event"("women_tee_id");
CREATE INDEX "event_route_segment_women_tee_id_idx" ON "event_route_segment"("women_tee_id");
ALTER TABLE "event" ADD CONSTRAINT "event_women_tee_id_fkey"
  FOREIGN KEY ("women_tee_id") REFERENCES "tee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_route_segment" ADD CONSTRAINT "event_route_segment_women_tee_id_fkey"
  FOREIGN KEY ("women_tee_id") REFERENCES "tee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
