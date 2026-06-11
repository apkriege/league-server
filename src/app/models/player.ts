import { prisma } from '../../prisma';

export default class PlayerService {
  static query(): any {
    return prisma.player;
  }

  static async findAll() {
    return await prisma.player.findMany({ where: { deletedAt: null } });
  }

  static async findById(playerId: number) {
    return await prisma.player.findFirst({ where: { id: playerId, deletedAt: null } });
  }

  static async findByLeagueId(leagueId: number) {
    return await prisma.player.findMany({
      where: { leagueId: leagueId, deletedAt: null },
      orderBy: [{ type: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  static async create(player: any) {
    return await prisma.player.create({ data: player });
  }

  static async update(playerId: number, player: any) {
    const existingPlayer = await this.findById(playerId);

    if (!existingPlayer) {
      throw new Error('Player not found');
    }

    return await prisma.player.update({ where: { id: playerId }, data: player });
  }

  static async delete(playerId: number) {
    const existingPlayer = await this.findById(playerId);

    if (!existingPlayer) {
      throw new Error('Player not found');
    }

    await prisma.player.update({ where: { id: playerId }, data: { deletedAt: new Date() } });
  }
}
