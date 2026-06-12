"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../../prisma");
class TeamService {
    static query() {
        return prisma_1.prisma.team;
    }
    static async findAll() {
        return await prisma_1.prisma.team.findMany();
    }
    static async findByTeamId(teamId) {
        return await prisma_1.prisma.team.findUnique({ where: { id: teamId } });
    }
    static async findByLeagueId(leagueId) {
        return await prisma_1.prisma.team.findMany({ where: { leagueId: leagueId } });
    }
    static async create(team) {
        return await prisma_1.prisma.team.create({ data: team });
    }
    static async update(id, team) {
        const existingTeam = await this.findByTeamId(id);
        if (!existingTeam) {
            throw new Error('Team not found');
        }
        return await prisma_1.prisma.team.update({ where: { id }, data: team });
    }
    static async delete(id) {
        const existingTeam = await this.findByTeamId(id);
        if (!existingTeam) {
            throw new Error('Team not found');
        }
        await prisma_1.prisma.team.update({ where: { id }, data: { deletedAt: new Date() } });
    }
}
exports.default = TeamService;
