import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

export default class EventService {
  static query(): any {
    return prisma.event;
  }

  static async findAll() {
    return await prisma.event.findMany();
  }

  static async findById(id: number) {
    return await prisma.event.findUnique({ where: { id } });
  }

  static async create(event: any) {
    return await prisma.event.create({ data: event });
  }

  static async update(id: number, event: any) {
    const existingEvent = await this.findById(id);

    if (!existingEvent) {
      throw new Error('Event not found');
    }

    return await prisma.event.update({ where: { id }, data: event });
  }

  static async delete(id: number) {
    const existingEvent = await this.findById(id);

    if (!existingEvent) {
      throw new Error('Event not found');
    }

    await prisma.event.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
