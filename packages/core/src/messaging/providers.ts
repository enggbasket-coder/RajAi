import { prisma, type MessagingConnection } from "@trackwise/database";
import { decryptSecret } from "@trackwise/shared";
import { MockTelegramProvider, MockWhatsAppProvider, type MessagingProviderAdapter, type ProviderConnection } from "@trackwise/messaging";
import { WhatsAppMessagingProvider } from "@trackwise/whatsapp";
import { TelegramMessagingProvider } from "@trackwise/telegram";

declare global {
  // eslint-disable-next-line no-var
  var __trackwiseProviders: Record<string, MessagingProviderAdapter> | undefined;
}

/** Provider registry: WHATSAPP_PROVIDER=mock|meta, TELEGRAM_PROVIDER=mock|telegram. */
export function getProvider(provider: "WHATSAPP" | "TELEGRAM"): MessagingProviderAdapter {
  const mode = provider === "WHATSAPP" ? process.env.WHATSAPP_PROVIDER || "mock" : process.env.TELEGRAM_PROVIDER || "mock";
  const key = `${provider}:${mode}`;
  globalThis.__trackwiseProviders ??= {};
  if (!globalThis.__trackwiseProviders[key]) {
    const realWa = new WhatsAppMessagingProvider();
    const realTg = new TelegramMessagingProvider();
    if (provider === "WHATSAPP") {
      globalThis.__trackwiseProviders[key] = mode === "meta" ? realWa : new MockWhatsAppProvider((p) => realWa.parseWebhookEvent(p));
    } else {
      globalThis.__trackwiseProviders[key] = mode === "telegram" ? realTg : new MockTelegramProvider((p, c) => realTg.parseWebhookEvent(p, c));
    }
  }
  return globalThis.__trackwiseProviders[key];
}

export function providerMode(provider: "WHATSAPP" | "TELEGRAM"): string {
  return provider === "WHATSAPP" ? process.env.WHATSAPP_PROVIDER || "mock" : process.env.TELEGRAM_PROVIDER || "mock";
}

function dec(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    return decryptSecret(v);
  } catch {
    return null;
  }
}

/** Decrypt a stored connection into adapter credentials (env values act as defaults). */
export function toProviderConnection(row: MessagingConnection): ProviderConnection | null {
  if (row.provider === "WHATSAPP") {
    const phoneNumberId = row.phoneNumberId || process.env.META_PHONE_NUMBER_ID || "";
    const accessToken = dec(row.accessTokenEncrypted) || process.env.META_ACCESS_TOKEN || "";
    if (!phoneNumberId) return null;
    return {
      provider: "WHATSAPP",
      connectionId: row.id,
      organizationId: row.organizationId,
      phoneNumberId,
      accessToken,
      appSecret: dec(row.appSecretEncrypted) || process.env.META_APP_SECRET || null,
      verifyToken: dec(row.verifyTokenEncrypted) || process.env.META_VERIFY_TOKEN || null,
      assignmentTemplateName: row.assignmentTemplateName || process.env.META_ASSIGNMENT_TEMPLATE_NAME || null,
      graphApiVersion: process.env.META_GRAPH_API_VERSION || "v21.0",
    };
  }
  const botToken = dec(row.botTokenEncrypted) || process.env.TELEGRAM_BOT_TOKEN || "";
  return {
    provider: "TELEGRAM",
    connectionId: row.id,
    organizationId: row.organizationId,
    botToken,
    webhookSecret: dec(row.webhookSecretEncrypted) || process.env.TELEGRAM_WEBHOOK_SECRET || null,
    botUsername: row.botUsername,
  };
}

export async function getEnabledConnection(organizationId: string, provider: "WHATSAPP" | "TELEGRAM") {
  const row = await prisma.messagingConnection.findUnique({ where: { organizationId_provider: { organizationId, provider } } });
  if (!row || !row.enabled) return null;
  return { row, conn: toProviderConnection(row) };
}

export async function findConnectionById(id: string) {
  const row = await prisma.messagingConnection.findUnique({ where: { id } });
  if (!row) return null;
  return { row, conn: toProviderConnection(row) };
}

export async function findWhatsAppConnectionByPhoneNumberId(phoneNumberId: string | null | undefined) {
  if (!phoneNumberId) return null;
  const row = await prisma.messagingConnection.findFirst({ where: { provider: "WHATSAPP", phoneNumberId } });
  if (!row) return null;
  return { row, conn: toProviderConnection(row) };
}
