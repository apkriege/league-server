ALTER TABLE "course"
ADD COLUMN "usga_course_id" INTEGER;

CREATE UNIQUE INDEX "course_usga_course_id_key" ON "course"("usga_course_id");
