"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../../prisma");
class CourseService {
    static query() {
        return prisma_1.prisma.club;
    }
    static async findAll() {
        return await prisma_1.prisma.club.findMany();
    }
    static async findById(id) {
        return await prisma_1.prisma.club.findUnique({ where: { id } });
    }
    static async create(club) {
        return await prisma_1.prisma.club.create({ data: club });
    }
    static async update(id, club) {
        const existingClub = await this.findById(id);
        if (!existingClub) {
            throw new Error('Club not found');
        }
        return await prisma_1.prisma.club.update({ where: { id }, data: club });
    }
    static async delete(id) {
        const existingClub = await this.findById(id);
        if (!existingClub) {
            throw new Error('Club not found');
        }
        await prisma_1.prisma.club.update({ where: { id }, data: { deletedAt: new Date() } });
    }
}
exports.default = CourseService;
