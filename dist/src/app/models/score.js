"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../../prisma");
class ScoreService {
    static query() {
        return prisma_1.prisma.score;
    }
    static async findAll() {
        return await prisma_1.prisma.score.findMany();
    }
    static async findById(id) {
        return await prisma_1.prisma.score.findUnique({ where: { id } });
    }
    static async create(eventScore) {
        return await prisma_1.prisma.score.create({ data: eventScore });
    }
    static async update(id, eventScore) {
        const existingEventScore = await this.findById(id);
        if (!existingEventScore) {
            throw new Error('Event score not found');
        }
        return await prisma_1.prisma.score.update({ where: { id }, data: eventScore });
    }
    static async delete(id) {
        const existingEventScore = await this.findById(id);
        if (!existingEventScore) {
            throw new Error('Event score not found');
        }
        await prisma_1.prisma.score.delete({ where: { id } });
    }
}
exports.default = ScoreService;
