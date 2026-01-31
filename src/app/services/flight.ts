import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

export default class FlightService {
  static query(): any {
    return prisma.flight;
  }

  static async findAll() {
    return await prisma.flight.findMany();
  }

  static async findById(id: number) {
    return await prisma.flight.findUnique({ where: { id } });
  }

  static async create(flight: any) {
    return await prisma.flight.create({ data: flight });
  }

  static async update(id: number, flight: any) {
    const existingFlight = await this.findById(id);

    if (!existingFlight) {
      throw new Error('Flight not found');
    }

    return await prisma.flight.update({ where: { id }, data: flight });
  }

  static async delete(id: number) {
    const existingFlight = await this.findById(id);

    if (!existingFlight) {
      throw new Error('Flight not found');
    }

    await prisma.flight.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
