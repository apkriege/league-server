import { prisma } from '../../prisma';
import { Prisma } from '@prisma/client';

type AuditInput = {
  userId?: number | null;
  leagueId?: number | null;
  entity: string;
  entityId?: number | null;
  action: string;
  summary: string;
  metadata?: Prisma.InputJsonValue | null;
};

export const writeAuditLog = async ({
  userId = null,
  leagueId = null,
  entity,
  entityId = null,
  action,
  summary,
  metadata = null,
}: AuditInput) => {
  try {
    await prisma.audit_log.create({
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
  } catch (error) {
    console.error('audit log error:', error instanceof Error ? error.message : error);
  }
};
