import { prisma } from '../../prisma';
import { Request, Response } from 'express';
import CourseService from '../models/course';

const normalizeHole = (hole: any, index: number) => ({
  num: Number(hole?.num ?? index + 1),
  par: Number(hole?.par ?? 4),
  dis: Number(hole?.dis ?? 0),
  hcp: Number(hole?.hcp ?? index + 1),
});

const normalizeTee = (tee: any) => ({
  name: String(tee?.name || ''),
  color: String(tee?.color || ''),
  distance: Number(tee?.distance ?? 0),
  par: Number(tee?.par ?? 0),
  frontPar: Number(tee?.frontPar ?? 0),
  backPar: Number(tee?.backPar ?? 0),
  slopeMen: Number(tee?.slopeMen ?? 0),
  slopeFrontMen: Number(tee?.slopeFrontMen ?? 0),
  slopeBackMen: Number(tee?.slopeBackMen ?? 0),
  slopeWomen:
    tee?.slopeWomen === null || tee?.slopeWomen === undefined || tee?.slopeWomen === ''
      ? null
      : Number(tee.slopeWomen),
  slopeFrontWomen:
    tee?.slopeFrontWomen === null ||
    tee?.slopeFrontWomen === undefined ||
    tee?.slopeFrontWomen === ''
      ? null
      : Number(tee.slopeFrontWomen),
  slopeBackWomen:
    tee?.slopeBackWomen === null || tee?.slopeBackWomen === undefined || tee?.slopeBackWomen === ''
      ? null
      : Number(tee.slopeBackWomen),
  ratingMen: Number(tee?.ratingMen ?? 0),
  ratingFrontMen: Number(tee?.ratingFrontMen ?? 0),
  ratingBackMen: Number(tee?.ratingBackMen ?? 0),
  ratingWomen:
    tee?.ratingWomen === null || tee?.ratingWomen === undefined || tee?.ratingWomen === ''
      ? null
      : Number(tee.ratingWomen),
  ratingFrontWomen:
    tee?.ratingFrontWomen === null ||
    tee?.ratingFrontWomen === undefined ||
    tee?.ratingFrontWomen === ''
      ? null
      : Number(tee.ratingFrontWomen),
  ratingBackWomen:
    tee?.ratingBackWomen === null ||
    tee?.ratingBackWomen === undefined ||
    tee?.ratingBackWomen === ''
      ? null
      : Number(tee.ratingBackWomen),
  holes: Array.isArray(tee?.holes) ? tee.holes.map(normalizeHole) : [],
});

const buildCourseData = (course: any) => {
  const tees = Array.isArray(course?.tees) ? course.tees.map(normalizeTee) : null;

  return {
    clubId: Number(course.clubId),
    name: course.name,
    description: course.description,
    location: course.location,
    phone: course.phone,
    accessType: course.accessType ?? course.courseAccessType,
    numHoles: course.numHoles,
    par: course.par,
    ...(tees ? { tees: { create: tees } } : {}),
  };
};

class CourseController {
  static getCourse = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);

      const course = await CourseService.query().findUnique({
        where: { id },
        include: {
          club: true,
          tees: true,
        },
      });

      if (!course) {
        res.status(404).send('Course not found');
        return;
      }

      res.status(200).send(course);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getCourses = async (req: Request, res: Response) => {
    try {
      const query = req.query;
      const courses = await CourseService.query().findMany({
        include: {
          club: true,
          tees: query.withTees === 'true',
        },
      });

      res.status(200).send(courses);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static createCourse = async (req: Request, res: Response) => {
    try {
      const course = req.body;

      const courseData = buildCourseData(course);

      const newCourse = await CourseService.create(courseData);
      res.status(201).send(newCourse);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static updateCourse = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const course = req.body;

      const baseData = {
        clubId: Number(course.clubId),
        name: course.name,
        description: course.description,
        location: course.location,
        phone: course.phone,
        accessType: course.accessType ?? course.courseAccessType,
        numHoles: course.numHoles,
        par: course.par,
      };

      // Incoming tees: preserve id if present so we can upsert instead of delete+create
      const incomingTees: (ReturnType<typeof normalizeTee> & { id?: number })[] | null =
        Array.isArray(course?.tees)
          ? course.tees.map((tee: any) => ({
              id: tee.id != null ? Number(tee.id) : undefined,
              ...normalizeTee(tee),
            }))
          : null;

      await prisma.$transaction(async (tx: any) => {
        // 1. Update base course fields
        await tx.course.update({ where: { id }, data: baseData });

        if (!incomingTees) return;

        // 2. Get existing tee ids for this course
        const existingTees = await tx.tee.findMany({
          where: { courseId: id },
          select: { id: true },
        });
        const existingTeeIds: number[] = existingTees.map((t: { id: number }) => t.id);

        // 3. Incoming tees with a known id are updates; those without are creates
        const teesToUpdate = incomingTees.filter((t) => t.id != null);
        const teesToCreate = incomingTees.filter((t) => t.id == null);
        const incomingIds = new Set(teesToUpdate.map((t) => t.id as number));

        // 4. Existing tees absent from the incoming payload — candidates for deletion
        const deleteCandidates = existingTeeIds.filter((eid) => !incomingIds.has(eid));

        if (deleteCandidates.length > 0) {
          // Only delete tees not referenced by event, round, or score
          const [evtRefs, roundRefs, scoreRefs] = await Promise.all([
            tx.event.findMany({
              where: { teeId: { in: deleteCandidates } },
              select: { teeId: true },
            }),
            tx.round.findMany({
              where: { teeId: { in: deleteCandidates } },
              select: { teeId: true },
            }),
            tx.score.findMany({
              where: { teeId: { in: deleteCandidates } },
              select: { teeId: true },
            }),
          ]);
          const referencedIds = new Set([
            ...evtRefs.map((e: { teeId: number }) => e.teeId),
            ...roundRefs.map((r: { teeId: number }) => r.teeId),
            ...scoreRefs.map((s: { teeId: number }) => s.teeId),
          ]);
          const safeToDelete = deleteCandidates.filter((eid) => !referencedIds.has(eid));
          if (safeToDelete.length > 0) {
            await tx.tee.deleteMany({ where: { id: { in: safeToDelete } } });
          }
        }

        // 5. Update existing tees
        for (const { id: teeId, ...teeData } of teesToUpdate) {
          await tx.tee.update({ where: { id: teeId }, data: teeData });
        }

        // 6. Create new tees
        if (teesToCreate.length > 0) {
          await tx.tee.createMany({
            data: teesToCreate.map(({ id: _id, ...teeData }) => ({ ...teeData, courseId: id })),
          });
        }
      });

      const updatedCourse = await prisma.course.findUnique({
        where: { id },
        include: { club: true, tees: true },
      });

      if (!updatedCourse) {
        res.status(404).send('Course not found');
        return;
      }

      res.status(200).send(updatedCourse);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static deleteCourse = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const deletedCourse = await CourseService.delete(id);
      res.status(200).json(deletedCourse);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export default CourseController;
