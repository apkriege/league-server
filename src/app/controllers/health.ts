import { Request, Response } from 'express';
import { prisma } from '../../prisma';

export default class HealthController {
  static async getHealth(req: Request, res: Response) {
    try {
      await prisma.$queryRaw`SELECT 1`;

      res.status(200).json({
        status: 'ok',
        database: 'ok',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'error',
        database: 'unavailable',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
