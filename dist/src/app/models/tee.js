"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../../prisma");
class TeeService {
    static query() {
        return prisma_1.prisma.tee;
    }
    static async findAll() {
        return await prisma_1.prisma.tee.findMany();
    }
    static async findById(id) {
        return await prisma_1.prisma.tee.findUnique({ where: { id } });
    }
    static async create(tee) {
        return await prisma_1.prisma.tee.create({ data: tee });
    }
    static async update(id, tee) {
        const existingTee = await this.findById(id);
        if (!existingTee) {
            throw new Error('Tee not found');
        }
        return await prisma_1.prisma.tee.update({ where: { id }, data: tee });
    }
    static async delete(id) {
        const existingTee = await this.findById(id);
        if (!existingTee) {
            throw new Error('Tee not found');
        }
        await prisma_1.prisma.tee.update({ where: { id }, data: { deletedAt: new Date() } });
    }
}
exports.default = TeeService;
