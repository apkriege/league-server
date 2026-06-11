import { prisma } from '../../prisma';

export default class UserService {
  static query(): any {
    return prisma.user;
  }

  static async first() {
    return await prisma.user.findFirst();
  }

  static async findById(id: number) {
    const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    return user;
  }

  static async findAll() {
    const users = await prisma.user.findMany({ where: { deletedAt: null } });
    return users;
  }

  static async findByEmail(email: string) {
    const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
    return user;
  }

  static async findByGoogleEmail(email: string) {
    const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
    return user;
  }

  static async create(user: any) {
    return await prisma.user.create({ data: user });
  }

  static async update(id: number, user: any) {
    const updatedUser = await prisma.user.update({ where: { id }, data: user });
    return updatedUser;
  }

  static async delete(id: number) {
    await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
