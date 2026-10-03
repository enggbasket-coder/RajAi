import { prisma } from "@trackwise/database";
import { encryptSecret, randomToken, validation } from "@trackwise/shared";
import { AuditService } from "../audit";
import { APP_URL, requirePermission, type Actor } from "../context";
import { getProvider, providerMode, toProviderConnection } from "./providers";

/** Safe, client-facing view of a connection — never includes secrets. */
export function publicConnection(row: Awaited<ReturnType<typeof prisma.messagingConnection.findFirst>>) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    enabled: row.enabled,
    status: row.status,
    wabaId: row.wabaId,
    phoneNumberId: row.phoneNumberId,
    displayPhoneNumber: row.displayPhoneNumber,
    assignmentTemplateName: row.assignmentTemplateName,
    hasAccessToken: !!row.accessTokenEncrypted,
    hasAppSecret: !!row.appSecretEncrypted,
    hasVerifyToken: !!row.verifyTokenEncrypted,
    botId: row.botId,
    botUsername: row.botUsername,
    hasBotToken: !!row.botTokenEncrypted,
    webhookStatus: row.webhookStatus,
    lastError: row.lastError,
    mode: providerMode(row.provider),
    updatedAt: row.updatedAt,
  };
}

export const ConnectionService = {
  async list(actor: Actor) {
    requirePermission(actor, "messaging:configure");
    const rows = await prisma.messagingConnection.findMany({ where: { organizationId: actor.organizationId } });
    return {
      whatsapp: publicConnection(rows.find((r) => r.provider === "WHATSAPP") ?? null),
      telegram: publicConnection(rows.find((r) => r.provider === "TELEGRAM") ?? null),
      webhookUrls: {
        whatsapp: `${APP_URL()}/api/webhooks/whatsapp`,
        telegram: rows.find((r) => r.provider === "TELEGRAM") ? `${APP_URL()}/api/webhooks/telegram/${rows.find((r) => r.provider === "TELEGRAM")!.id}` : null,
      },
    };
  },

  async configureWhatsApp(actor: Actor, input: { wabaId?: string; phoneNumberId: string; displayPhoneNumber?: string; accessToken?: string; appSecret?: string; verifyToken?: string; assignmentTemplateName?: string; enabled?: boolean }) {
    requirePermission(actor, "messaging:configure");
    if (!input.phoneNumberId?.trim()) throw validation("Phone number ID is required");
    const data = {
      wabaId: input.wabaId?.trim() || null,
      phoneNumberId: input.phoneNumberId.trim(),
      displayPhoneNumber: input.displayPhoneNumber?.trim() || null,
      assignmentTemplateName: input.assignmentTemplateName?.trim() || null,
      ...(input.accessToken ? { accessTokenEncrypted: encryptSecret(input.accessToken) } : {}),
      ...(input.appSecret ? { appSecretEncrypted: encryptSecret(input.appSecret) } : {}),
      ...(input.verifyToken ? { verifyTokenEncrypted: encryptSecret(input.verifyToken) } : {}),
      enabled: input.enabled ?? true,
      status: (input.enabled ?? true) ? ("CONNECTED" as const) : ("DISABLED" as const),
      lastError: null,
    };
    const row = await prisma.messagingConnection.upsert({
      where: { organizationId_provider: { organizationId: actor.organizationId, provider: "WHATSAPP" } },
      create: { organizationId: actor.organizationId, provider: "WHATSAPP", ...data },
      update: data,
    });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "messaging.configuration_changed", entityType: "MessagingConnection", entityId: row.id, metadata: { provider: "WHATSAPP", enabled: row.enabled } });
    return publicConnection(row);
  },

  async configureTelegram(actor: Actor, input: { botToken?: string; botUsername?: string; enabled?: boolean }) {
    requirePermission(actor, "messaging:configure");
    const existing = await prisma.messagingConnection.findUnique({ where: { organizationId_provider: { organizationId: actor.organizationId, provider: "TELEGRAM" } } });
    const webhookSecret = randomToken(24);
    const data = {
      ...(input.botToken ? { botTokenEncrypted: encryptSecret(input.botToken), webhookSecretEncrypted: encryptSecret(webhookSecret) } : {}),
      botUsername: input.botUsername?.trim().replace(/^@/, "") || existing?.botUsername || null,
      enabled: input.enabled ?? true,
      status: (input.enabled ?? true) ? ("CONNECTED" as const) : ("DISABLED" as const),
      lastError: null,
    };
    if (!existing && !input.botToken && providerMode("TELEGRAM") !== "mock") throw validation("Bot token is required");
    let row = await prisma.messagingConnection.upsert({
      where: { organizationId_provider: { organizationId: actor.organizationId, provider: "TELEGRAM" } },
      create: { organizationId: actor.organizationId, provider: "TELEGRAM", ...data, ...(input.botToken ? {} : { webhookSecretEncrypted: encryptSecret(webhookSecret) }) },
      update: data,
    });
    // Register the webhook with Telegram (real provider) or no-op (mock).
    if (row.enabled) {
      const conn = toProviderConnection(row);
      const provider = getProvider("TELEGRAM");
      if (conn && provider.registerWebhook) {
        const url = `${APP_URL()}/api/webhooks/telegram/${row.id}`;
        const secret = conn.provider === "TELEGRAM" ? conn.webhookSecret ?? webhookSecret : webhookSecret;
        const res = await provider.registerWebhook(conn, url, secret);
        const me = provider.describeBot ? await provider.describeBot(conn) : null;
        row = await prisma.messagingConnection.update({
          where: { id: row.id },
          data: {
            webhookStatus: res.ok ? "REGISTERED" : `FAILED: ${res.description ?? "unknown"}`,
            status: res.ok ? "CONNECTED" : "ERROR",
            lastError: res.ok ? null : res.description ?? null,
            ...(me ? { botId: me.id, botUsername: me.username } : {}),
          },
        });
      }
    }
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "messaging.configuration_changed", entityType: "MessagingConnection", entityId: row.id, metadata: { provider: "TELEGRAM", enabled: row.enabled } });
    return publicConnection(row);
  },

  async setEnabled(actor: Actor, provider: "WHATSAPP" | "TELEGRAM", enabled: boolean) {
    requirePermission(actor, "messaging:configure");
    const row = await prisma.messagingConnection.update({
      where: { organizationId_provider: { organizationId: actor.organizationId, provider } },
      data: { enabled, status: enabled ? "CONNECTED" : "DISABLED" },
    });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "messaging.configuration_changed", entityType: "MessagingConnection", entityId: row.id, metadata: { provider, enabled } });
    return publicConnection(row);
  },
};
