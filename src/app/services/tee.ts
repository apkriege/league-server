import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

export default class TeeService {
  static query(): any {
    return prisma.tee;
  }

  static async findAll() {
    return await prisma.tee.findMany();
  }

  static async findById(id: number) {
    return await prisma.tee.findUnique({ where: { id } });
  }

  static async create(tee: any) {
    return await prisma.tee.create({ data: tee });
  }

  static async update(id: number, tee: any) {
    const existingTee = await this.findById(id);

    if (!existingTee) {
      throw new Error('Tee not found');
    }

    return await prisma.tee.update({ where: { id }, data: tee });
  }

  static async delete(id: number) {
    const existingTee = await this.findById(id);

    if (!existingTee) {
      throw new Error('Tee not found');
    }

    await prisma.tee.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
