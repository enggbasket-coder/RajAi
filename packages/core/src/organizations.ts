import { prisma } from "@trackwise/database";
import { AppError, isValidTimeZone, validation } from "@trackwise/shared";
import { AuditService } from "./audit";
import { requirePermission, type Actor } from "./context";

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";
}

export const OrganizationService = {
  async create(ownerUserId: string, input: { name: string; timezone?: string }) {
    if (!input.name.trim()) throw validation("Organization name is required");
    const tz = input.timezone ?? "UTC";
    if (!isValidTimeZone(tz)) throw validation("Invalid timezone");
    let slug = slugify(input.name);
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.organization.findUnique({ where: { slug } });
      if (!exists) break;
      slug = `${slugify(input.name)}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const org = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: input.name.trim(), slug, timezone: tz } });
      await tx.organizationMember.create({ data: { organizationId: org.id, userId: ownerUserId, role: "OWNER" } });
      return org;
    });
    await AuditService.log({ organizationId: org.id, actorUserId: ownerUserId, action: "organization.created", entityType: "Organization", entityId: org.id });
    return org;
  },

  async get(actor: Actor) {
    const org = await prisma.organization.findUnique({ where: { id: actor.organizationId } });
    if (!org) throw new AppError("NOT_FOUND", "Organization not found");
    return org;
  },

  async update(
    actor: Actor,
    input: Partial<{
      name: string;
      timezone: string;
      defaultManagementChannel: "WEB" | "WHATSAPP" | "TELEGRAM";
      defaultBillable: boolean;
      manualTimeEnabled: boolean;
      idleTimeoutMinutes: number;
      allowChannelFallback: boolean;
      managersCreateClients: boolean;
      managersCreateProjects: boolean;
      notificationSettings: Record<string, boolean>;
    }>,
  ) {
    requirePermission(actor, "org:manage");
    if (input.timezone && !isValidTimeZone(input.timezone)) throw validation("Invalid timezone");
    if (input.idleTimeoutMinutes !== undefined && (input.idleTimeoutMinutes < 1 || input.idleTimeoutMinutes > 240)) {
      throw validation("Idle timeout must be between 1 and 240 minutes");
    }
    const before = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
    const org = await prisma.organization.update({ where: { id: actor.organizationId }, data: input });
    const messagingKeys = ["defaultManagementChannel", "allowChannelFallback", "notificationSettings"] as const;
    const changedMessaging = messagingKeys.some((k) => k in input);
    await AuditService.log({
      organizationId: org.id,
      actorUserId: actor.userId,
      action: changedMessaging ? "messaging.configuration_changed" : "organization.updated",
      entityType: "Organization",
      entityId: org.id,
      metadata: { changed: Object.keys(input), before: pick(before, Object.keys(input)) },
    });
    if ("idleTimeoutMinutes" in input || "manualTimeEnabled" in input) {
      await AuditService.log({ organizationId: org.id, actorUserId: actor.userId, action: "monitoring.setting_changed", entityType: "Organization", entityId: org.id, metadata: { changed: Object.keys(input) } });
    }
    return org;
  },
};

function pick(obj: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}
