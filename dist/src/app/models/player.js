"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../../prisma");
class PlayerService {
    static query() {
        return prisma_1.prisma.player;
    }
    static async findAll() {
        return await prisma_1.prisma.player.findMany({ where: { deletedAt: null } });
    }
    static async findById(playerId) {
        return await prisma_1.prisma.player.findFirst({ where: { id: playerId, deletedAt: null } });
    }
    static async findByLeagueId(leagueId) {
        return await prisma_1.prisma.player.findMany({
            where: { leagueId: leagueId, deletedAt: null },
            orderBy: [{ type: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
        });
    }
    static async create(player) {
        return await prisma_1.prisma.player.create({ data: player });
    }
    static async update(playerId, player) {
        const existingPlayer = await this.findById(playerId);
        if (!existingPlayer) {
            throw new Error('Player not found');
        }
        return await prisma_1.prisma.player.update({ where: { id: playerId }, data: player });
    }
    static async delete(playerId) {
        const existingPlayer = await this.findById(playerId);
        if (!existingPlayer) {
            throw new Error('Player not found');
        }
        await prisma_1.prisma.player.update({ where: { id: playerId }, data: { deletedAt: new Date() } });
    }
}
exports.default = PlayerService;
