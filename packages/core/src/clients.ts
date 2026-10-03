import { prisma } from "@trackwise/database";
import { forbidden, notFound, validation } from "@trackwise/shared";
import { AuditService } from "./audit";
import { requirePermission, type Actor } from "./context";

async function assertCanWriteClients(actor: Actor) {
  requirePermission(actor, "clients:write");
  if (actor.role === "MANAGER") {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
    if (!org.managersCreateClients) throw forbidden("Managers are not permitted to manage clients in this organization");
  }
}

export const ClientService = {
  list(actor: Actor, opts: { includeInactive?: boolean } = {}) {
    requirePermission(actor, "clients:read");
    return prisma.client.findMany({
      where: { organizationId: actor.organizationId, ...(opts.includeInactive ? {} : { active: true }) },
      include: { _count: { select: { projects: true } } },
      orderBy: { name: "asc" },
    });
  },
  async get(actor: Actor, id: string) {
    requirePermission(actor, "clients:read");
    const c = await prisma.client.findFirst({ where: { id, organizationId: actor.organizationId }, include: { projects: { orderBy: { name: "asc" } } } });
    if (!c) throw notFound("Client");
    return c;
  },
  async create(actor: Actor, input: { name: string; code?: string | null; notes?: string | null }) {
    await assertCanWriteClients(actor);
    if (!input.name?.trim()) throw validation("Client name is required");
    const c = await prisma.client.create({ data: { organizationId: actor.organizationId, name: input.name.trim(), code: input.code?.trim() || null, notes: input.notes ?? null } });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "client.created", entityType: "Client", entityId: c.id, metadata: { name: c.name } });
    return c;
  },
  async update(actor: Actor, id: string, input: Partial<{ name: string; code: string | null; notes: string | null; active: boolean }>) {
    await assertCanWriteClients(actor);
    await this.get(actor, id);
    const c = await prisma.client.update({ where: { id }, data: { ...input, code: input.code === undefined ? undefined : input.code?.trim() || null } });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "client.updated", entityType: "Client", entityId: id, metadata: { changed: Object.keys(input) } });
    return c;
  },
  async remove(actor: Actor, id: string) {
    await assertCanWriteClients(actor);
    const c = await this.get(actor, id);
    if (c.projects.length > 0) {
      await prisma.client.update({ where: { id }, data: { active: false } });
    } else {
      await prisma.client.delete({ where: { id } });
    }
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "client.deleted", entityType: "Client", entityId: id });
  },
};
