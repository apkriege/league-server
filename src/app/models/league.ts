import { prisma } from '../../prisma';

export default class LeagueService {
  static query() {
    return prisma.league;
  }

  static async findById(id: number) {
    return await prisma.league.findFirst({ where: { id, deletedAt: null } });
  }

  static async delete(id: number) {
    const existingLeague = await this.findById(id);

    if (!existingLeague) {
      throw new Error('League not found');
    }

    await prisma.league.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
