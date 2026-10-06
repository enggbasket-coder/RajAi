import { prisma } from "@trackwise/database";
import { AppError, forbidden, maskPhone, normalizePhone, notFound, shortCode, validation } from "@trackwise/shared";
import { isAdminLike } from "@trackwise/rbac";
import { AuditService } from "../audit";
import { type Actor } from "../context";

export const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

function assertSelfOrAdmin(actor: Actor, userId: string) {
  if (actor.userId !== userId && !isAdminLike(actor.role)) throw forbidden("You can only manage your own messaging settings");
}

export const IdentityService = {
  async list(actor: Actor, userId: string) {
    assertSelfOrAdmin(actor, userId);
    const member = await prisma.organizationMember.findFirst({ where: { organizationId: actor.organizationId, userId } });
    if (!member) throw notFound("Member");
    const ids = await prisma.userMessagingIdentity.findMany({ where: { organizationId: actor.organizationId, userId } });
    const tg = await prisma.messagingConnection.findUnique({ where: { organizationId_provider: { organizationId: actor.organizationId, provider: "TELEGRAM" } } });
    return {
      preferredAssignmentChannel: member.preferredAssignmentChannel,
      whatsapp: ids.filter((i) => i.provider === "WHATSAPP").map((i) => ({ id: i.id, phoneMasked: maskPhone(i.phoneNumber ?? i.providerUserId), phone: actor.userId === userId || isAdminLike(actor.role) ? i.phoneNumber : null, verified: i.verified, optedIn: i.optedIn, optedInAt: i.optedInAt, optedOutAt: i.optedOutAt, disabled: i.disabled }))[0] ?? null,
      telegram: ids.filter((i) => i.provider === "TELEGRAM").map((i) => ({ id: i.id, username: i.username, verified: i.verified, disabled: i.disabled, linkedAt: i.verifiedAt }))[0] ?? null,
      telegramBotUsername: tg?.botUsername ?? null,
      telegramEnabled: !!tg?.enabled,
    };
  },

  /**
   * Register a WhatsApp number. Phone is normalized to E.164. Opt-in is explicit consent recorded with a source.
   * (Production deployments may add OTP verification; the MVP treats the user entering their own number in an
   * authenticated session as verification, and an admin entering it as unverified until the employee confirms.)
   */
  async setWhatsApp(actor: Actor, userId: string, input: { phone: string; optIn: boolean; defaultCountryCode?: string }) {
    assertSelfOrAdmin(actor, userId);
    const phone = normalizePhone(input.phone, input.defaultCountryCode);
    if (!phone) throw validation("Enter the phone number in international format, e.g. +919876543210");
    const member = await prisma.organizationMember.findFirst({ where: { organizationId: actor.organizationId, userId, active: true } });
    if (!member) throw notFound("Member");
    const clash = await prisma.userMessagingIdentity.findFirst({ where: { organizationId: actor.organizationId, provider: "WHATSAPP", providerUserId: phone, NOT: { userId } } });
    if (clash) throw new AppError("CONFLICT", "That phone number is already linked to another member");
    const self = actor.userId === userId;
    const now = new Date();
    const identity = await prisma.userMessagingIdentity.upsert({
      where: { organizationId_userId_provider: { organizationId: actor.organizationId, userId, provider: "WHATSAPP" } },
      create: {
        organizationId: actor.organizationId,
        userId,
        provider: "WHATSAPP",
        providerUserId: phone,
        phoneNumber: phone,
        verified: self,
        verifiedAt: self ? now : null,
        optedIn: self && input.optIn,
        optedInAt: self && input.optIn ? now : null,
        optInSource: self && input.optIn ? "web_settings" : null,
      },
      update: {
        providerUserId: phone,
        phoneNumber: phone,
        verified: self,
        verifiedAt: self ? now : null,
        optedIn: self && input.optIn,
        optedInAt: self && input.optIn ? now : null,
        optedOutAt: self && !input.optIn ? now : null,
        optInSource: self && input.optIn ? "web_settings" : null,
        disabled: false,
      },
    });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "messaging.identity_updated", entityType: "UserMessagingIdentity", entityId: identity.id, metadata: { provider: "WHATSAPP", userId, optedIn: identity.optedIn } });
    return identity;
  },

  async setWhatsAppOptIn(actor: Actor, userId: string, optIn: boolean) {
    if (actor.userId !== userId) throw forbidden("Only the employee can change their own opt-in");
    const now = new Date();
    const identity = await prisma.userMessagingIdentity.update({
      where: { organizationId_userId_provider: { organizationId: actor.organizationId, userId, provider: "WHATSAPP" } },
      data: optIn ? { optedIn: true, optedInAt: now, optInSource: "web_settings", optedOutAt: null } : { optedIn: false, optedOutAt: now },
    });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: optIn ? "messaging.opted_in" : "messaging.opted_out", entityType: "UserMessagingIdentity", entityId: identity.id, metadata: { provider: "WHATSAPP" } });
    return identity;
  },

  /** Generate a short-lived, single-use, organization-scoped Telegram linking code. */
  async createTelegramLinkToken(actor: Actor, userId: string) {
    if (actor.userId !== userId) throw forbidden("Employees link their own Telegram account");
    const tg = await prisma.messagingConnection.findUnique({ where: { organizationId_provider: { organizationId: actor.organizationId, provider: "TELEGRAM" } } });
    if (!tg?.enabled) throw validation("Telegram is not connected for this organization yet");
    await prisma.telegramLinkToken.deleteMany({ where: { organizationId: actor.organizationId, userId, usedAt: null } });
    let code = `TW-${shortCode(6)}`;
    for (let i = 0; i < 3 && (await prisma.telegramLinkToken.findUnique({ where: { code } })); i++) code = `TW-${shortCode(6)}`;
    const token = await prisma.telegramLinkToken.create({ data: { organizationId: actor.organizationId, userId, code, expiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS) } });
    return { code: token.code, expiresAt: token.expiresAt, botUsername: tg.botUsername, deepLink: tg.botUsername ? `https://t.me/${tg.botUsername}?start=${encodeURIComponent(token.code)}` : null };
  },

  /** Consume a link code sent via /start. Called by the inbound handler (no actor: identity is being created). */
  async consumeTelegramLinkToken(organizationId: string, code: string, telegram: { userId: string; chatId: string | null; username?: string | null }) {
    const token = await prisma.telegramLinkToken.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!token || token.organizationId !== organizationId || token.usedAt || token.expiresAt < new Date()) return null;
    const member = await prisma.organizationMember.findFirst({ where: { organizationId, userId: token.userId, active: true } });
    if (!member) return null;
    const clash = await prisma.userMessagingIdentity.findFirst({ where: { organizationId, provider: "TELEGRAM", providerUserId: telegram.userId, NOT: { userId: token.userId } } });
    if (clash) return null;
    const now = new Date();
    const identity = await prisma.$transaction(async (tx) => {
      await tx.telegramLinkToken.update({ where: { id: token.id }, data: { usedAt: now } });
      return tx.userMessagingIdentity.upsert({
        where: { organizationId_userId_provider: { organizationId, userId: token.userId, provider: "TELEGRAM" } },
        create: { organizationId, userId: token.userId, provider: "TELEGRAM", providerUserId: telegram.userId, providerChatId: telegram.chatId, username: telegram.username ?? null, verified: true, verifiedAt: now, optedIn: true, optedInAt: now, optInSource: "telegram_start" },
        update: { providerUserId: telegram.userId, providerChatId: telegram.chatId, username: telegram.username ?? null, verified: true, verifiedAt: now, optedIn: true, optedInAt: now, optedOutAt: null, disabled: false },
      });
    });
    await AuditService.log({ organizationId, actorUserId: token.userId, action: "messaging.telegram_linked", entityType: "UserMessagingIdentity", entityId: identity.id });
    return identity;
  },

  async remove(actor: Actor, userId: string, identityId: string) {
    assertSelfOrAdmin(actor, userId);
    const identity = await prisma.userMessagingIdentity.findFirst({ where: { id: identityId, organizationId: actor.organizationId, userId } });
    if (!identity) throw notFound("Messaging identity");
    await prisma.userMessagingIdentity.delete({ where: { id: identity.id } });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "messaging.identity_removed", entityType: "UserMessagingIdentity", entityId: identity.id, metadata: { provider: identity.provider, userId } });
  },

  async setDisabled(actor: Actor, userId: string, identityId: string, disabled: boolean) {
    if (!isAdminLike(actor.role)) throw forbidden("Only admins can disable a messaging identity");
    const identity = await prisma.userMessagingIdentity.findFirst({ where: { id: identityId, organizationId: actor.organizationId, userId } });
    if (!identity) throw notFound("Messaging identity");
    const updated = await prisma.userMessagingIdentity.update({ where: { id: identity.id }, data: { disabled } });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: disabled ? "messaging.identity_disabled" : "messaging.identity_enabled", entityType: "UserMessagingIdentity", entityId: identity.id });
    return updated;
  },

  /** Resolve an inbound sender to an active organization member. Never creates users. */
  async resolveSender(organizationId: string, provider: "WHATSAPP" | "TELEGRAM", providerUserId: string) {
    const identity = await prisma.userMessagingIdentity.findUnique({
      where: { organizationId_provider_providerUserId: { organizationId, provider, providerUserId } },
      include: { conversation: true },
    });
    if (!identity || identity.disabled) return null;
    const member = await prisma.organizationMember.findFirst({ where: { organizationId, userId: identity.userId, active: true }, include: { user: true } });
    if (!member) return null;
    return { identity, member };
  },
};
