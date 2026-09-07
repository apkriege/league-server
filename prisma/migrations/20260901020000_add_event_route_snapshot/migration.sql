ALTER TABLE "event"
ADD COLUMN "route_snapshot" JSONB;

ALTER TABLE "event_route_segment"
ADD CONSTRAINT "event_route_segment_position_check" CHECK ("position" IN (0, 1));
