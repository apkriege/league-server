import { prisma } from '../../prisma';
import { Request, Response } from 'express';
import CourseService from '../models/course';
import {
  loadCourseFromDirectory,
  searchCourseDirectory,
  searchStateCourseDirectory,
} from '../services/courseImport';
import {
  buildCourseRequestEmail,
  buildManualCourseRequestEmail,
} from '../emailTemplates/courseRequest';
import { sendAppEmail } from '../services/email';
import { normalizeTimeZone } from '../utils/time-zone';

const nullableNumber = (value: unknown) =>
  value === null || value === undefined || value === '' ? null : Number(value);

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
  slopeMen: nullableNumber(tee?.slopeMen),
  slopeFrontMen: nullableNumber(tee?.slopeFrontMen),
  slopeBackMen: nullableNumber(tee?.slopeBackMen),
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
  ratingMen: nullableNumber(tee?.ratingMen),
  ratingFrontMen: nullableNumber(tee?.ratingFrontMen),
  ratingBackMen: nullableNumber(tee?.ratingBackMen),
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
  holesWomen: Array.isArray(tee?.holesWomen)
    ? tee.holesWomen.map(normalizeHole)
    : Array.isArray(tee?.holes)
      ? tee.holes.map(normalizeHole)
      : [],
});

const buildCourseData = (course: any) => {
  const tees = Array.isArray(course?.tees) ? course.tees.map(normalizeTee) : null;

  return {
    clubId: Number(course.clubId),
    name: course.name,
    description: course.description,
    location: course.location,
    phone: course.phone,
    timeZone: normalizeTimeZone(course.timeZone),
    accessType: course.accessType ?? course.courseAccessType,
    numHoles: course.numHoles,
    par: course.par,
    externalProvider: course.externalProvider || null,
    externalId: course.externalId || null,
    scorecardUrl: course.scorecardUrl || null,
    usgaCourseId: nullableNumber(course.usgaCourseId),
    sourceUpdatedAt: course.externalId ? new Date() : null,
    ...(tees ? { tees: { create: tees } } : {}),
  };
};

class CourseController {
  static searchCourseDirectory = async (req: Request, res: Response) => {
    const name = String(req.query.name || '').trim();
    const state = String(req.query.state || '').trim().toUpperCase();

    if (name.length < 2 || name.length > 120) {
      return res.status(400).json({ message: 'A course name is required.' });
    }

    try {
      const results = await searchCourseDirectory(name, state || undefined);
      const existing = await prisma.course.findMany({
        where: { externalProvider: 'GolfCourseAPI', externalId: { in: results.map((result) => result.externalId) } },
        select: { externalId: true },
      });
      const existingIds = new Set(existing.map((course) => course.externalId));
      return res.status(200).json({
        results: results.map((result) => ({ ...result, alreadyImported: existingIds.has(result.externalId) })),
        attribution: 'Course and scorecard data provided by GolfCourseAPI.',
      });
    } catch (error) {
      console.error(error);
      return res.status(502).json({ message: 'Unable to search the course directory right now.' });
    }
  };

  static searchStateCourseDirectory = async (req: Request, res: Response) => {
    const state = String(req.query.state || '').trim().toUpperCase();
    const offset = Math.max(0, Number(req.query.offset) || 0);
    if (!/^[A-Z]{2}$/.test(state)) {
      return res.status(400).json({ message: 'A two-letter state code is required.' });
    }
    try {
      const page = await searchStateCourseDirectory(state, offset);
      const existing = await prisma.course.findMany({
        where: { externalProvider: 'GolfCourseAPI', externalId: { in: page.results.map((result) => result.externalId) } },
        select: { externalId: true },
      });
      const existingIds = new Set(existing.map((course) => course.externalId));
      return res.status(200).json({
        ...page,
        results: page.results.map((result) => ({ ...result, alreadyImported: existingIds.has(result.externalId) })),
        attribution: 'State discovery by OpenGolfAPI; course data provided by GolfCourseAPI.',
      });
    } catch (error) {
      console.error(error);
      return res.status(502).json({ message: 'Unable to check that state right now.' });
    }
  };

  static importCourse = async (req: Request, res: Response) => {
    const externalId = String(req.params.externalId || '').trim();
    if (!/^[a-z0-9_-]{8,300}$/i.test(externalId)) {
      return res.status(400).json({ message: 'A course directory ID is required.' });
    }

    try {
      const importedCourse = await loadCourseFromDirectory(externalId);
      return res.status(200).json(importedCourse);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ message: 'Unable to load that course from the directory.' });
    }
  };

  static requestCourse = async (req: Request, res: Response) => {
    const externalId = String(req.body?.externalId || '').trim();
    if (!/^[a-z0-9_-]{8,300}$/i.test(externalId)) {
      return res.status(400).json({ message: 'A valid course directory ID is required.' });
    }

    const requester = req.user as
      | {
          id: number;
          firstName: string;
          lastName: string;
          email: string;
        }
      | undefined;
    if (!requester?.id || !requester.email) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }

    try {
      const importedCourse = await loadCourseFromDirectory(externalId);
      const result = await sendAppEmail({
        ...buildCourseRequestEmail({ externalId, requester, importedCourse }),
        from: process.env.COURSE_REQUEST_FROM,
      });

      if (result.status === 'skipped') {
        return res.status(503).json({
          message: 'Course request email is not configured. Please contact support.',
        });
      }
      if (result.status === 'failed') {
        throw new Error(`Verified course request email failed: ${result.reason}`);
      }

      return res.status(200).json({ message: 'Course request sent.' });
    } catch (error) {
      console.error(error);
      return res.status(502).json({
        message: 'Unable to verify and request that course right now.',
      });
    }
  };

  static requestManualCourse = async (req: Request, res: Response) => {
    const courseName = String(req.body?.courseName || '').trim();
    const city = String(req.body?.city || '').trim();
    const state = String(req.body?.state || '').trim();
    if (
      courseName.length < 2 ||
      courseName.length > 120 ||
      city.length < 2 ||
      city.length > 80 ||
      state.length < 2 ||
      state.length > 50
    ) {
      return res.status(400).json({
        message: 'Course name, city, and state are required.',
      });
    }

    const requester = req.user as
      | {
          id: number;
          firstName: string;
          lastName: string;
          email: string;
        }
      | undefined;
    if (!requester?.id || !requester.email) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }

    try {
      const result = await sendAppEmail({
        ...buildManualCourseRequestEmail({ requester, courseName, city, state }),
        from: process.env.COURSE_REQUEST_FROM,
      });

      if (result.status === 'skipped') {
        return res.status(503).json({
          message: 'Course request email is not configured. Please contact support.',
        });
      }
      if (result.status === 'failed') {
        throw new Error(`Manual course request email failed: ${result.reason}`);
      }

      return res.status(200).json({ message: 'Manual course request sent.' });
    } catch (error) {
      console.error(error);
      return res.status(502).json({
        message: 'Unable to send that manual course request right now.',
      });
    }
  };

  static getCourse = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);

      const course = await CourseService.query().findUnique({
        where: { id, deletedAt: null },
        include: {
          club: true,
          tees: { where: { deletedAt: null } },
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
        where: { deletedAt: null },
        include: {
          club: true,
          tees: query.withTees === 'true' ? { where: { deletedAt: null } } : false,
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
      if (error instanceof Error && error.message.startsWith('Invalid IANA timezone')) {
        return res.status(400).json({ message: error.message });
      }
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
        timeZone: normalizeTimeZone(course.timeZone),
        accessType: course.accessType ?? course.courseAccessType,
        numHoles: course.numHoles,
        par: course.par,
        externalProvider: course.externalProvider || null,
        externalId: course.externalId || null,
        scorecardUrl: course.scorecardUrl || null,
        usgaCourseId: nullableNumber(course.usgaCourseId),
        sourceUpdatedAt: course.externalId ? new Date() : null,
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
          where: { courseId: id, deletedAt: null },
          select: { id: true },
        });
        const existingTeeIds: number[] = existingTees.map((t: { id: number }) => t.id);

        // 3. Incoming tees with a known id are updates; those without are creates
        const teesToUpdate = incomingTees.filter((t) => t.id != null);
        const teesToCreate = incomingTees.filter((t) => t.id == null);
        const incomingIds = new Set(teesToUpdate.map((t) => t.id as number));

        if (teesToUpdate.some((tee) => !existingTeeIds.includes(Number(tee.id)))) {
          throw new Error('One or more tees do not belong to this course');
        }

        // 4. Hide tees removed from the form while preserving historical event and score relations.
        const removedTeeIds = existingTeeIds.filter((existingId) => !incomingIds.has(existingId));
        if (removedTeeIds.length > 0) {
          const scheduledEvent = await tx.event.findFirst({
            where: {
              teeId: { in: removedTeeIds },
              deletedAt: null,
              status: { notIn: ['completed', 'canceled'] },
            },
            select: { id: true },
          });
          if (scheduledEvent) {
            throw new Error('A selected tee is assigned to an upcoming event. Update that event first.');
          }
          await tx.tee.updateMany({
            where: { id: { in: removedTeeIds }, courseId: id, deletedAt: null },
            data: { deletedAt: new Date() },
          });
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
        where: { id, deletedAt: null },
        include: { club: true, tees: { where: { deletedAt: null } } },
      });

      if (!updatedCourse) {
        res.status(404).send('Course not found');
        return;
      }

      res.status(200).send(updatedCourse);
    } catch (error) {
      console.error(error);
      if (
        error instanceof Error &&
        (error.message.includes('do not belong') ||
          error.message.startsWith('Invalid IANA timezone'))
      ) {
        return res.status(400).json({ message: error.message });
      }
      if (error instanceof Error && error.message.includes('upcoming event')) {
        return res.status(409).json({ message: error.message });
      }
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static deleteCourse = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const scheduledEvent = await prisma.event.findFirst({
        where: {
          courseId: id,
          deletedAt: null,
          status: { notIn: ['completed', 'canceled'] },
        },
        select: { id: true },
      });
      if (scheduledEvent) {
        return res.status(409).json({
          message: 'This course is assigned to an upcoming event. Update that event first.',
        });
      }
      const deletedCourse = await CourseService.delete(id);
      res.status(200).json(deletedCourse);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export default CourseController;
