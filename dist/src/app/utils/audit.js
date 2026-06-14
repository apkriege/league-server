"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAuditLog = void 0;
const prisma_1 = require("../../prisma");
const writeAuditLog = async ({ userId = null, leagueId = null, entity, entityId = null, action, summary, metadata = null, }) => {
    try {
        await prisma_1.prisma.audit_log.create({
            data: {
                userId,
                leagueId,
                entity,
                entityId,
                action,
                summary,
                ...(metadata ? { metadata } : {}),
            },
        });
    }
    catch (error) {
        console.error('audit log error:', error instanceof Error ? error.message : error);
    }
};
exports.writeAuditLog = writeAuditLog;
