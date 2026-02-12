import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

export default class CourseService {
  static query(): any {
    return prisma.course;
  }

  static async findAll() {
    return await prisma.course.findMany();
  }

  static async findById(id: number) {
    return await prisma.course.findUnique({ where: { id } });
  }

  static async create(course: any) {
    return await prisma.course.create({ data: course });
  }

  static async update(id: number, course: any) {
    const existingCourse = await this.findById(id);

    if (!existingCourse) {
      throw new Error('Course not found');
    }

    return await prisma.course.update({ where: { id }, data: course });
  }

  static async delete(id: number) {
    const existingCourse = await this.findById(id);

    if (!existingCourse) {
      throw new Error('Course not found');
    }

    await prisma.course.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
