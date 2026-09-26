import type { Request, Response } from 'express';
import { loadUsgaRatingTable, UsgaLookupError } from '../services/usgaRatingLookup';

export default class UsgaRatingController {
  static getCourseRatings = async (req: Request, res: Response) => {
    const courseId = Number(req.params.courseId);
    if (!Number.isSafeInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ message: 'Enter a valid USGA Course ID.' });
    }
    try {
      return res.json(await loadUsgaRatingTable(courseId));
    } catch (error) {
      if (error instanceof UsgaLookupError) {
        return res.status(502).json({ message: error.message });
      }
      return res.status(502).json({
        message: 'Could not reach USGA right now. Try again or use manual paste.',
      });
    }
  };
}
