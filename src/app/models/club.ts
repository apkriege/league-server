import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

export default class CourseService {
  static query(): any {
    return prisma.club;
  }

  static async findAll() {
    return await prisma.club.findMany();
  }

  static async findById(id: number) {
    return await prisma.club.findUnique({ where: { id } });
  }

  static async create(club: any) {
    return await prisma.club.create({ data: club });
  }

  static async update(id: number, club: any) {
    const existingClub = await this.findById(id);

    if (!existingClub) {
      throw new Error('Club not found');
    }

    return await prisma.club.update({ where: { id }, data: club });
  }

  static async delete(id: number) {
    const existingClub = await this.findById(id);

    if (!existingClub) {
      throw new Error('Club not found');
    }

    await prisma.club.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
