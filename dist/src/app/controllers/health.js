"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../../prisma");
class HealthController {
    static async getHealth(req, res) {
        try {
            await prisma_1.prisma.$queryRaw `SELECT 1`;
            res.status(200).json({
                status: 'ok',
                database: 'ok',
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            res.status(503).json({
                status: 'error',
                database: 'unavailable',
                timestamp: new Date().toISOString(),
            });
        }
    }
}
exports.default = HealthController;
