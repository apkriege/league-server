"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../../prisma");
class UserService {
    static query() {
        return prisma_1.prisma.user;
    }
    static async first() {
        return await prisma_1.prisma.user.findFirst();
    }
    static async findById(id) {
        const user = await prisma_1.prisma.user.findFirst({ where: { id, deletedAt: null } });
        return user;
    }
    static async findAll() {
        const users = await prisma_1.prisma.user.findMany({ where: { deletedAt: null } });
        return users;
    }
    static async findByEmail(email) {
        const user = await prisma_1.prisma.user.findFirst({ where: { email, deletedAt: null } });
        return user;
    }
    static async findByGoogleEmail(email) {
        const user = await prisma_1.prisma.user.findFirst({ where: { email, deletedAt: null } });
        return user;
    }
    static async create(user) {
        return await prisma_1.prisma.user.create({ data: user });
    }
    static async update(id, user) {
        const updatedUser = await prisma_1.prisma.user.update({ where: { id }, data: user });
        return updatedUser;
    }
    static async delete(id) {
        await prisma_1.prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
    }
}
exports.default = UserService;
