/**
 * WhatsAppMessagingProvider — official Meta WhatsApp Business Cloud API adapter.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 * This file contains no business logic: it sends messages, verifies webhooks and
 * normalizes inbound payloads.
 */
import { createHmac } from "node:crypto";
import { normalizePhone, safeEqual } from "@trackwise/shared";
import {
  formatWhatsAppAssignment,
  type AssignmentMessageContent,
  type MessagingProviderAdapter,
  type NormalizedMessagingEvent,
  type OutboundMessage,
  type OutboundRecipient,
  type ParsedWebhook,
  type ProviderConnection,
  type ProviderMessageResult,
  type WebhookRequest,
} from "@trackwise/messaging";

const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);
// Meta error codes that are safe to retry: rate limits / transient service issues.
const RETRYABLE_CODES = new Set([4, 17, 80007, 130429, 131000, 131016, 131056]);
// 131047: outside 24h customer-service window → a template is required.
const REENGAGEMENT_CODE = 131047;

type MetaError = { message?: string; code?: number; error_subcode?: number; type?: string; fbtrace_id?: string };

function assertWhatsApp(conn: ProviderConnection): Extract<ProviderConnection, { provider: "WHATSAPP" }> {
  if (conn.provider !== "WHATSAPP") throw new Error("WhatsApp adapter received a non-WhatsApp connection");
  return conn;
}

export class WhatsAppMessagingProvider implements MessagingProviderAdapter {
  readonly provider = "WHATSAPP" as const;
  readonly isMock = false;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private async post(conn: Extract<ProviderConnection, { provider: "WHATSAPP" }>, body: Record<string, unknown>): Promise<ProviderMessageResult> {
    const url = `https://graph.facebook.com/${conn.graphApiVersion}/${conn.phoneNumberId}/messages`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${conn.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...body }),
      });
    } catch (e) {
      return { ok: false, errorCode: "NETWORK", errorMessage: (e as Error).message, retryable: true };
    }
    let json: { messages?: { id: string }[]; error?: MetaError } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      /* non-JSON body */
    }
    if (res.ok && json.messages?.[0]?.id) {
      return { ok: true, externalMessageId: json.messages[0].id, status: "SENT", raw: json };
    }
    const err = json.error ?? {};
    const code = err.code ?? res.status;
    return {
      ok: false,
      errorCode: String(code),
      errorMessage: err.message ?? `HTTP ${res.status}`,
      retryable: RETRYABLE_HTTP.has(res.status) || RETRYABLE_CODES.has(code),
      raw: json,
    };
  }

  async sendMessage(connection: ProviderConnection, to: OutboundRecipient, msg: OutboundMessage): Promise<ProviderMessageResult> {
    const conn = assertWhatsApp(connection);
    const recipient = to.providerUserId.replace(/^\+/, "");
    const text = await this.post(conn, { to: recipient, type: "text", text: { body: msg.text, preview_url: false } });
    if (text.ok) return text;
    // Outside the 24h window: fall back to an approved template when one is configured.
    if (Number(text.errorCode) === REENGAGEMENT_CODE && msg.template) {
      return this.post(conn, {
        to: recipient,
        type: "template",
        template: {
          name: msg.template.name,
          language: { code: msg.template.language ?? "en" },
          components: [{ type: "body", parameters: msg.template.bodyParams.map((t) => ({ type: "text", text: t })) }],
        },
      });
    }
    return text;
  }

  async sendTaskAssignment(connection: ProviderConnection, to: OutboundRecipient, content: AssignmentMessageContent): Promise<ProviderMessageResult> {
    const conn = assertWhatsApp(connection);
    const template = conn.assignmentTemplateName
      ? {
          name: conn.assignmentTemplateName,
          bodyParams: [content.taskTitle, content.projectName, content.dueLabel ?? "—", content.estimateLabel ?? "—"],
        }
      : undefined;
    return this.sendMessage(conn, to, { text: formatWhatsAppAssignment(content), template });
  }

  /**
   * GET: Meta verification handshake (hub.verify_token must match).
   * POST: X-Hub-Signature-256 = sha256 HMAC of the raw body with the app secret.
   */
  async verifyWebhook(connection: ProviderConnection | null, req: WebhookRequest): Promise<boolean> {
    if (req.method === "GET") {
      const token = req.query["hub.verify_token"];
      const expected = connection && connection.provider === "WHATSAPP" ? connection.verifyToken : process.env.META_VERIFY_TOKEN;
      return !!token && !!expected && safeEqual(token, expected);
    }
    const sig = req.headers["x-hub-signature-256"];
    const secret = connection && connection.provider === "WHATSAPP" ? connection.appSecret : process.env.META_APP_SECRET;
    if (!sig || !secret) return false;
    const expected = "sha256=" + createHmac("sha256", secret).update(req.rawBody, "utf8").digest("hex");
    return safeEqual(sig, expected);
  }

  async parseWebhookEvent(payload: unknown): Promise<ParsedWebhook[]> {
    const out: ParsedWebhook[] = [];
    const root = payload as { object?: string; entry?: unknown[] };
    if (!root || root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return out;
    for (const entry of root.entry as { changes?: unknown[] }[]) {
      for (const change of (entry.changes ?? []) as { field?: string; value?: WaValue }[]) {
        if (change.field !== "messages" || !change.value) continue;
        const v = change.value;
        const connectionHint = v.metadata?.phone_number_id ?? null;
        const names = new Map<string, string>();
        for (const c of v.contacts ?? []) if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);
        for (const m of v.messages ?? []) {
          if (!m.id || !m.from) continue;
          const phone = normalizePhone(m.from) ?? `+${m.from}`;
          let text = "";
          if (m.type === "text") text = m.text?.body ?? "";
          else if (m.type === "button") text = m.button?.text ?? m.button?.payload ?? "";
          else if (m.type === "interactive") text = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
          const ev: NormalizedMessagingEvent = {
            type: "MESSAGE_RECEIVED",
            provider: "WHATSAPP",
            providerUserId: phone,
            chatId: null,
            externalMessageId: m.id,
            text,
            phoneNumber: phone,
            displayName: names.get(m.from) ?? null,
            timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
            connectionHint,
          };
          out.push({ externalEventId: `msg:${m.id}`, eventType: `message.${m.type ?? "unknown"}`, events: [ev] });
        }
        for (const s of v.statuses ?? []) {
          if (!s.id || !s.status) continue;
          const status = ({ sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" } as const)[s.status];
          if (!status) continue;
          const err = s.errors?.[0];
          out.push({
            externalEventId: `status:${s.id}:${s.status}`,
            eventType: `status.${s.status}`,
            events: [
              {
                type: "MESSAGE_STATUS",
                provider: "WHATSAPP",
                externalMessageId: s.id,
                status,
                errorCode: err ? String(err.code) : null,
                errorMessage: err?.title ?? err?.message ?? null,
                timestamp: s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date(),
                connectionHint,
              },
            ],
          });
        }
      }
    }
    return out;
  }
}

interface WaValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: {
    id?: string;
    from?: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
    button?: { text?: string; payload?: string };
    interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
  }[];
  statuses?: {
    id?: string;
    status?: "sent" | "delivered" | "read" | "failed";
    timestamp?: string;
    recipient_id?: string;
    errors?: { code?: number; title?: string; message?: string }[];
  }[];
}

/** Build a webhook payload in Meta's shape — used by mock console and tests. */
export function buildWhatsAppInboundPayload(input: { phoneNumberId: string; from: string; text: string; messageId: string; name?: string }) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550000000", phone_number_id: input.phoneNumberId },
              contacts: [{ profile: { name: input.name ?? "Employee" }, wa_id: input.from.replace(/^\+/, "") }],
              messages: [
                {
                  from: input.from.replace(/^\+/, ""),
                  id: input.messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: input.text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

export function buildWhatsAppStatusPayload(input: { phoneNumberId: string; messageId: string; status: "sent" | "delivered" | "read" | "failed"; recipient: string; error?: { code: number; title: string } }) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550000000", phone_number_id: input.phoneNumberId },
              statuses: [
                {
                  id: input.messageId,
                  status: input.status,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: input.recipient.replace(/^\+/, ""),
                  ...(input.error ? { errors: [input.error] } : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
