import { prisma, type Db, type Prisma } from "@trackwise/database";

export interface AuditInput {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/** Append-only audit trail. Never exposes an update/delete path. */
export const AuditService = {
  async log(input: AuditInput, db: Db = prisma) {
    return db.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadataJson: (input.metadata ?? {}) as Prisma.InputJsonValue,
        ipAddress: input.ipAddress ?? null,
      },
    });
  },
  async list(organizationId: string, opts: { limit?: number; cursor?: string; action?: string; entityType?: string } = {}) {
    return prisma.auditLog.findMany({
      where: { organizationId, ...(opts.action ? { action: opts.action } : {}), ...(opts.entityType ? { entityType: opts.entityType } : {}) },
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 100,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    });
  },
};
