import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

export default class TeamService {
  static query() {
    return prisma.team;
  }

  static async findAll() {
    return await prisma.team.findMany();
  }

  static async findByTeamId(teamId: number) {
    return await prisma.team.findUnique({ where: { id: teamId } });
  }

  static async findByLeagueId(leagueId: number) {
    return await prisma.team.findMany({ where: { leagueId: leagueId } });
  }

  static async create(team: any) {
    return await prisma.team.create({ data: team });
  }

  static async update(id: number, team: any) {
    const existingTeam = await this.findByTeamId(id);

    if (!existingTeam) {
      throw new Error('Team not found');
    }

    return await prisma.team.update({ where: { id }, data: team });
  }

  static async delete(id: number) {
    const existingTeam = await this.findByTeamId(id);

    if (!existingTeam) {
      throw new Error('Team not found');
    }

    await prisma.team.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
