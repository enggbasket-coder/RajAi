import { prisma, type ProjectStatus } from "@trackwise/database";
import { forbidden, notFound, validation } from "@trackwise/shared";
import { AuditService } from "./audit";
import { requirePermission, type Actor } from "./context";

async function assertCanWriteProjects(actor: Actor) {
  requirePermission(actor, "projects:write");
  if (actor.role === "MANAGER") {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
    if (!org.managersCreateProjects) throw forbidden("Managers are not permitted to manage projects in this organization");
  }
}

export interface ProjectInput {
  name: string;
  clientId?: string | null;
  code?: string | null;
  description?: string | null;
  managerUserId?: string | null;
  budgetHours?: number | null;
  billable?: boolean;
  hourlyRate?: number | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  status?: ProjectStatus;
}

export const ProjectService = {
  list(actor: Actor, opts: { includeArchived?: boolean; clientId?: string } = {}) {
    requirePermission(actor, "projects:read");
    return prisma.project.findMany({
      where: { organizationId: actor.organizationId, ...(opts.includeArchived ? {} : { archived: false }), ...(opts.clientId ? { clientId: opts.clientId } : {}) },
      include: { client: true, _count: { select: { tasks: true } } },
      orderBy: { name: "asc" },
    });
  },
  async get(actor: Actor, id: string) {
    requirePermission(actor, "projects:read");
    const p = await prisma.project.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: { client: true, tasks: { include: { assignments: true }, orderBy: { createdAt: "desc" } } },
    });
    if (!p) throw notFound("Project");
    const hours = await prisma.timeEntry.aggregate({ where: { organizationId: actor.organizationId, projectId: id }, _sum: { durationSeconds: true } });
    return { ...p, trackedSeconds: hours._sum.durationSeconds ?? 0 };
  },
  async create(actor: Actor, input: ProjectInput) {
    await assertCanWriteProjects(actor);
    if (!input.name?.trim()) throw validation("Project name is required");
    if (input.clientId) {
      const client = await prisma.client.findFirst({ where: { id: input.clientId, organizationId: actor.organizationId } });
      if (!client) throw validation("Client not found in this organization");
    }
    if (input.managerUserId) {
      const m = await prisma.organizationMember.findFirst({ where: { organizationId: actor.organizationId, userId: input.managerUserId, active: true } });
      if (!m) throw validation("Manager must be a member of this organization");
    }
    const p = await prisma.project.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name.trim(),
        clientId: input.clientId ?? null,
        code: input.code?.trim() || null,
        description: input.description ?? null,
        managerUserId: input.managerUserId ?? actor.userId,
        budgetHours: input.budgetHours ?? null,
        billable: input.billable ?? true,
        hourlyRate: input.hourlyRate ?? null,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        status: input.status ?? "ACTIVE",
      },
    });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "project.created", entityType: "Project", entityId: p.id, metadata: { name: p.name } });
    return p;
  },
  async update(actor: Actor, id: string, input: Partial<ProjectInput>) {
    await assertCanWriteProjects(actor);
    await this.get(actor, id);
    const p = await prisma.project.update({ where: { id }, data: { ...input, code: input.code === undefined ? undefined : input.code?.trim() || null } });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "project.updated", entityType: "Project", entityId: id, metadata: { changed: Object.keys(input) } });
    return p;
  },
  async archive(actor: Actor, id: string, archived = true) {
    await assertCanWriteProjects(actor);
    await this.get(actor, id);
    const p = await prisma.project.update({ where: { id }, data: { archived, status: archived ? "ARCHIVED" : "ACTIVE" } });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: archived ? "project.archived" : "project.unarchived", entityType: "Project", entityId: id });
    return p;
  },
};
