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

export const SHARED_WHATSAPP_CONNECTION_ID = "shared-whatsapp";

/** The platform-wide "Trackwise by PlusBrains" WhatsApp number, configured once from env (META_*).
 *  Organizations without their own WhatsApp connection send and receive through it; inbound messages are
 *  routed to the organization by the sender's verified phone number. Returns null when not configured. */
export function getSharedWhatsAppConnection(): ProviderConnection | null {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID || "";
  if (!phoneNumberId) return null;
  const accessToken = process.env.META_ACCESS_TOKEN || "";
  if (!accessToken && providerMode("WHATSAPP") === "meta") return null;
  return {
    provider: "WHATSAPP",
    connectionId: SHARED_WHATSAPP_CONNECTION_ID,
    organizationId: "",
    phoneNumberId,
    accessToken,
    appSecret: process.env.META_APP_SECRET || null,
    verifyToken: process.env.META_VERIFY_TOKEN || null,
    assignmentTemplateName: process.env.META_ASSIGNMENT_TEMPLATE_NAME || null,
    graphApiVersion: process.env.META_GRAPH_API_VERSION || "v21.0",
  };
}

export function sharedWhatsAppInfo() {
  const conn = getSharedWhatsAppConnection();
  return { configured: !!conn, displayPhoneNumber: process.env.META_DISPLAY_PHONE_NUMBER || null, displayName: process.env.META_DISPLAY_NAME || "Trackwise by PlusBrains" };
}

export interface ResolvedConnection {
  row: MessagingConnection | null;
  conn: ProviderConnection | null;
  /** True when this is the platform-wide shared WhatsApp number (no owning organization). */
  shared: boolean;
}

/** The connection an organization sends through: its own enabled connection, else (WhatsApp only, and only when the
 *  organization has not configured one at all) the shared platform number. An explicitly disabled connection stays off. */
export async function getEnabledConnection(organizationId: string, provider: "WHATSAPP" | "TELEGRAM"): Promise<ResolvedConnection | null> {
  const row = await prisma.messagingConnection.findUnique({ where: { organizationId_provider: { organizationId, provider } } });
  if (row) {
    if (!row.enabled) return null;
    return { row, conn: toProviderConnection(row), shared: false };
  }
  if (provider === "WHATSAPP") {
    const shared = getSharedWhatsAppConnection();
    if (shared) return { row: null, conn: { ...shared, organizationId }, shared: true };
  }
  return null;
}

export async function findConnectionById(id: string): Promise<ResolvedConnection | null> {
  const row = await prisma.messagingConnection.findUnique({ where: { id } });
  if (!row) return null;
  return { row, conn: toProviderConnection(row), shared: false };
}

export async function findWhatsAppConnectionByPhoneNumberId(phoneNumberId: string | null | undefined): Promise<ResolvedConnection | null> {
  if (!phoneNumberId) return null;
  const row = await prisma.messagingConnection.findFirst({ where: { provider: "WHATSAPP", phoneNumberId } });
  if (row) return { row, conn: toProviderConnection(row), shared: false };
  const shared = getSharedWhatsAppConnection();
  if (shared && shared.provider === "WHATSAPP" && shared.phoneNumberId === phoneNumberId) return { row: null, conn: shared, shared: true };
  return null;
}
