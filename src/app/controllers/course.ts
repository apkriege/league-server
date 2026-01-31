import { Request, Response } from 'express';
import { ParsedQs } from 'qs';
import CourseService from '../services/course';
import { relationBuilder } from '../utils/relation-builder';

class CourseController {
  static getCourse = async (req: Request, res: Response) => {
    try {
      const query = req.query;

      const id = parseInt(req.params.id);

      const course = await CourseService.findById(id);

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

      const courseData = {
        clubId: course.clubId,
        name: course.name,
        description: course.description,
        location: course.location,
        phone: course.phone,
        courseAccessType: course.courseAccessType,
        numHoles: course.numHoles,
        par: course.par,
      };

      const newCourse = await CourseService.create(courseData);
      res.status(201).send(newCourse);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static updateCourse = async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const course = req.body;

      const courseData = {
        clubId: course.clubId,
        name: course.name,
        description: course.description,
        location: course.location,
        phone: course.phone,
        courseAccessType: course.courseAccessType,
        numHoles: course.numHoles,
        par: course.par,
      };

      const updatedCourse = await CourseService.update(id, courseData);

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
      const id = parseInt(req.params.id);
      const deletedCourse = await CourseService.delete(id);
      res.status(200).json(deletedCourse);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export default CourseController;
