"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../../prisma");
class CourseService {
    static query() {
        return prisma_1.prisma.course;
    }
    static async findAll() {
        return await prisma_1.prisma.course.findMany({ where: { deletedAt: null } });
    }
    static async findById(id) {
        return await prisma_1.prisma.course.findFirst({ where: { id, deletedAt: null } });
    }
    static async create(course) {
        return await prisma_1.prisma.course.create({ data: course });
    }
    static async update(id, course) {
        const existingCourse = await this.findById(id);
        if (!existingCourse) {
            throw new Error('Course not found');
        }
        return await prisma_1.prisma.course.update({ where: { id }, data: course });
    }
    static async delete(id) {
        const existingCourse = await this.findById(id);
        if (!existingCourse) {
            throw new Error('Course not found');
        }
        await prisma_1.prisma.course.update({ where: { id }, data: { deletedAt: new Date() } });
    }
}
exports.default = CourseService;
