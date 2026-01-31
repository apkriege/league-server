import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

export default class PlayerService {
  static query(): any {
    return prisma.player;
  }

  static async findAll() {
    return await prisma.player.findMany();
  }

  static async findByPlayerId(playerId: number) {
    return await prisma.player.findUnique({ where: { id: playerId } });
  }

  static async findByLeagueId(leagueId: number) {
    return await prisma.player.findMany({ where: { leagueId: leagueId } });
  }

  static async create(player: any) {
    return await prisma.player.create({ data: player });
  }

  static async update(playerId: number, player: any) {
    const existingPlayer = await this.findByPlayerId(playerId);

    if (!existingPlayer) {
      throw new Error('Player not found');
    }

    return await prisma.player.update({ where: { id: playerId }, data: player });
  }

  static async delete(playerId: number) {
    const existingPlayer = await this.findByPlayerId(playerId);

    if (!existingPlayer) {
      throw new Error('Player not found');
    }

    await prisma.player.update({ where: { id: playerId }, data: { deletedAt: new Date() } });
  }
}
