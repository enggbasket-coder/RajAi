import { prisma } from "@trackwise/database";
import { assignableRoles, isAdminLike } from "@trackwise/rbac";
import { AppError, forbidden, notFound, randomToken, sha256Hex, validation, type Role } from "@trackwise/shared";
import { AuditService } from "./audit";
import { APP_URL, requirePermission, type Actor } from "./context";

export interface MemberSummary {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  displayName: string | null;
  preferredAssignmentChannel: "WHATSAPP" | "TELEGRAM" | "BOTH" | "DEFAULT";
  lastSeenAt: Date | null;
  channels: { whatsapp: ChannelReadiness; telegram: ChannelReadiness };
}

export type ChannelReadiness = { ready: boolean; label: string; detail?: string };

export function memberDisplayName(m: { displayName: string | null; user: { name: string } }) {
  return m.displayName || m.user.name;
}

export const MemberService = {
  async list(actor: Actor, opts: { includeInactive?: boolean } = {}): Promise<MemberSummary[]> {
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: actor.organizationId, ...(opts.includeInactive ? {} : { active: true }) },
      include: { user: { include: { messagingIdentities: { where: { organizationId: actor.organizationId } } } } },
      orderBy: { createdAt: "asc" },
    });
    const connections = await prisma.messagingConnection.findMany({ where: { organizationId: actor.organizationId } });
    const waOn = connections.some((c) => c.provider === "WHATSAPP" && c.enabled);
    const tgOn = connections.some((c) => c.provider === "TELEGRAM" && c.enabled);
    return members.map((m) => {
      const wa = m.user.messagingIdentities.find((i) => i.provider === "WHATSAPP");
      const tg = m.user.messagingIdentities.find((i) => i.provider === "TELEGRAM");
      return {
        id: m.id,
        userId: m.userId,
        name: memberDisplayName(m),
        email: m.user.email,
        role: m.role as Role,
        active: m.active,
        displayName: m.displayName,
        preferredAssignmentChannel: m.preferredAssignmentChannel,
        lastSeenAt: m.lastSeenAt,
        channels: {
          whatsapp: readiness("WHATSAPP", waOn, wa),
          telegram: readiness("TELEGRAM", tgOn, tg),
        },
      };
    });
  },

  async get(actor: Actor, userId: string) {
    const m = await prisma.organizationMember.findFirst({ where: { organizationId: actor.organizationId, userId }, include: { user: true } });
    if (!m) throw notFound("Member");
    return m;
  },

  async updateRole(actor: Actor, userId: string, role: Role) {
    requirePermission(actor, "members:manage");
    if (!assignableRoles(actor.role).includes(role)) throw forbidden("You cannot assign that role");
    const target = await this.get(actor, userId);
    if (target.role === "OWNER" && actor.role !== "OWNER") throw forbidden("Only an owner can change an owner");
    if (target.userId === actor.userId && role !== actor.role) throw forbidden("You cannot change your own role");
    const updated = await prisma.organizationMember.update({ where: { id: target.id }, data: { role } });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "member.role_changed", entityType: "OrganizationMember", entityId: target.id, metadata: { from: target.role, to: role, userId } });
    return updated;
  },

  async update(actor: Actor, userId: string, input: Partial<{ active: boolean; displayName: string | null; managerUserId: string | null; preferredAssignmentChannel: "WHATSAPP" | "TELEGRAM" | "BOTH" | "DEFAULT" }>) {
    const target = await this.get(actor, userId);
    const self = target.userId === actor.userId;
    if (!self) requirePermission(actor, "members:manage");
    if (self && ("active" in input || "managerUserId" in input)) {
      if (!isAdminLike(actor.role)) throw forbidden("You cannot change your own membership status");
    }
    if (target.role === "OWNER" && input.active === false) throw forbidden("Owners cannot be deactivated");
    const updated = await prisma.organizationMember.update({ where: { id: target.id }, data: input });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "member.updated", entityType: "OrganizationMember", entityId: target.id, metadata: { changed: Object.keys(input) } });
    return updated;
  },
};

function readiness(provider: "WHATSAPP" | "TELEGRAM", connectionOn: boolean, identity?: { verified: boolean; optedIn: boolean; disabled: boolean } | null): ChannelReadiness {
  if (!connectionOn) return { ready: false, label: "Not configured", detail: `${provider === "WHATSAPP" ? "WhatsApp" : "Telegram"} is not connected for this organization` };
  if (!identity) return { ready: false, label: "Not Connected" };
  if (identity.disabled) return { ready: false, label: "Disabled" };
  if (!identity.verified) return { ready: false, label: "Unverified" };
  if (provider === "WHATSAPP" && !identity.optedIn) return { ready: false, label: "Not opted in" };
  return { ready: true, label: "✓" };
}

export const InvitationService = {
  async create(actor: Actor, input: { email: string; role: Role }) {
    requirePermission(actor, "members:invite");
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw validation("Invalid email");
    if (!assignableRoles(actor.role).includes(input.role)) throw forbidden("You cannot invite that role");
    const existing = await prisma.organizationMember.findFirst({ where: { organizationId: actor.organizationId, user: { email } } });
    if (existing) throw new AppError("CONFLICT", "That person is already a member");
    const token = randomToken(24);
    const inv = await prisma.invitation.create({
      data: {
        organizationId: actor.organizationId,
        email,
        role: input.role,
        invitedByUserId: actor.userId,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "user.invited", entityType: "Invitation", entityId: inv.id, metadata: { email, role: input.role } });
    return { invitation: inv, token, url: `${APP_URL()}/invite/${token}` };
  },

  async list(actor: Actor) {
    requirePermission(actor, "members:invite");
    return prisma.invitation.findMany({ where: { organizationId: actor.organizationId, acceptedAt: null }, orderBy: { createdAt: "desc" } });
  },

  async getByToken(token: string) {
    const inv = await prisma.invitation.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { organization: true } });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) return null;
    const inviter = await prisma.user.findUnique({ where: { id: inv.invitedByUserId }, select: { name: true } });
    return { id: inv.id, email: inv.email, role: inv.role as Role, organization: { id: inv.organization.id, name: inv.organization.name }, inviter: inviter?.name ?? "A manager", expiresAt: inv.expiresAt };
  },

  async accept(token: string, userId: string) {
    const inv = await prisma.invitation.findUnique({ where: { tokenHash: sha256Hex(token) } });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw validation("Invitation is invalid or has expired");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.email !== inv.email) throw forbidden(`This invitation was sent to ${inv.email}. Sign in with that email to accept it.`);
    const member = await prisma.$transaction(async (tx) => {
      const member = await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: inv.organizationId, userId } },
        create: { organizationId: inv.organizationId, userId, role: inv.role },
        update: { active: true, role: inv.role },
      });
      await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
      return member;
    });
    await AuditService.log({ organizationId: inv.organizationId, actorUserId: userId, action: "invitation.accepted", entityType: "OrganizationMember", entityId: member.id, metadata: { role: inv.role } });
    return member;
  },
};
