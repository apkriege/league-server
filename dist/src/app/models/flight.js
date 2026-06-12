"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../../prisma");
class FlightService {
    static query() {
        return prisma_1.prisma.flight;
    }
    static async findAll() {
        return await prisma_1.prisma.flight.findMany();
    }
    static async findById(id) {
        return await prisma_1.prisma.flight.findUnique({ where: { id } });
    }
    static async create(flight) {
        return await prisma_1.prisma.flight.create({ data: flight });
    }
    static async update(id, flight) {
        const existingFlight = await this.findById(id);
        if (!existingFlight) {
            throw new Error('Flight not found');
        }
        return await prisma_1.prisma.flight.update({ where: { id }, data: flight });
    }
    static async delete(id) {
        const existingFlight = await this.findById(id);
        if (!existingFlight) {
            throw new Error('Flight not found');
        }
        await prisma_1.prisma.flight.update({ where: { id }, data: { deletedAt: new Date() } });
    }
}
exports.default = FlightService;
