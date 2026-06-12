"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../../prisma");
class EventService {
    static query() {
        return prisma_1.prisma.event;
    }
    static async findAll() {
        return await prisma_1.prisma.event.findMany();
    }
    static async findById(id) {
        return await prisma_1.prisma.event.findUnique({ where: { id } });
    }
    static async create(event) {
        return await prisma_1.prisma.event.create({ data: event });
    }
    static async update(id, event) {
        const existingEvent = await this.findById(id);
        if (!existingEvent) {
            throw new Error('Event not found');
        }
        return await prisma_1.prisma.event.update({ where: { id }, data: event });
    }
    static async delete(id) {
        const existingEvent = await this.findById(id);
        if (!existingEvent) {
            throw new Error('Event not found');
        }
        await prisma_1.prisma.event.update({ where: { id }, data: { deletedAt: new Date() } });
    }
}
exports.default = EventService;
