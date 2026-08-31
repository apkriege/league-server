ALTER TABLE "course"
  ADD COLUMN "external_provider" TEXT,
  ADD COLUMN "external_id" TEXT,
  ADD COLUMN "scorecard_url" TEXT,
  ADD COLUMN "source_updated_at" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "course_external_provider_external_id_key"
  ON "course"("external_provider", "external_id");

ALTER TABLE "tee"
  ALTER COLUMN "slope_men" DROP NOT NULL,
  ALTER COLUMN "slope_front_men" DROP NOT NULL,
  ALTER COLUMN "slope_back_men" DROP NOT NULL,
  ALTER COLUMN "rating_men" DROP NOT NULL,
  ALTER COLUMN "rating_front_men" DROP NOT NULL,
  ALTER COLUMN "rating_back_men" DROP NOT NULL;

ALTER TABLE "tee" ADD COLUMN "holes_women" JSONB[] NOT NULL DEFAULT ARRAY[]::JSONB[];
