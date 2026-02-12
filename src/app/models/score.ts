import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

export default class ScoreService {
  static query(): any {
    return prisma.score;
  }

  static async findAll() {
    return await prisma.score.findMany();
  }

  static async findById(id: number) {
    return await prisma.score.findUnique({ where: { id } });
  }

  static async create(eventScore: any) {
    return await prisma.score.create({ data: eventScore });
  }

  static async update(id: number, eventScore: any) {
    const existingEventScore = await this.findById(id);

    if (!existingEventScore) {
      throw new Error('Event score not found');
    }

    return await prisma.score.update({ where: { id }, data: eventScore });
  }

  static async delete(id: number) {
    const existingEventScore = await this.findById(id);

    if (!existingEventScore) {
      throw new Error('Event score not found');
    }

    await prisma.score.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
