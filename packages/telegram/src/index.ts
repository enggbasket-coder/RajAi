/**
 * TelegramMessagingProvider — official Telegram Bot API adapter.
 * Docs: https://core.telegram.org/bots/api
 * Sends messages with inline keyboards, verifies the webhook secret header and
 * normalizes updates. No business logic lives here.
 */
import { safeEqual } from "@trackwise/shared";
import {
  formatTelegramAssignment,
  type AssignmentMessageContent,
  type InlineButton,
  type MessagingProviderAdapter,
  type OutboundMessage,
  type OutboundRecipient,
  type ParsedWebhook,
  type ProviderConnection,
  type ProviderMessageResult,
  type WebhookRequest,
} from "@trackwise/messaging";

type TgResponse<T> = { ok: boolean; result?: T; error_code?: number; description?: string; parameters?: { retry_after?: number } };

function assertTelegram(conn: ProviderConnection): Extract<ProviderConnection, { provider: "TELEGRAM" }> {
  if (conn.provider !== "TELEGRAM") throw new Error("Telegram adapter received a non-Telegram connection");
  return conn;
}

function keyboard(buttons: InlineButton[] | undefined) {
  if (!buttons || buttons.length === 0) return undefined;
  const row = buttons.map((b) => (b.url ? { text: b.label, url: b.url } : { text: b.label, callback_data: b.data ?? "" }));
  // Telegram renders rows; put at most 2 buttons per row for readability.
  const rows: typeof row[] = [];
  for (let i = 0; i < row.length; i += 2) rows.push(row.slice(i, i + 2));
  return { inline_keyboard: rows };
}

export class TelegramMessagingProvider implements MessagingProviderAdapter {
  readonly provider = "TELEGRAM" as const;
  readonly isMock = false;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private async call<T>(token: string, method: string, body: Record<string, unknown>): Promise<TgResponse<T> & { httpStatus: number }> {
    try {
      const res = await this.fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let json: TgResponse<T> = { ok: false };
      try {
        json = (await res.json()) as TgResponse<T>;
      } catch {
        /* ignore */
      }
      return { ...json, httpStatus: res.status };
    } catch (e) {
      return { ok: false, description: (e as Error).message, httpStatus: 0 };
    }
  }

  /** Telegram message ids are only unique per chat, so the stored id is "<chat_id>:<message_id>". */
  private toResult(r: TgResponse<{ message_id: number; chat?: { id: number } }> & { httpStatus: number }, chatId: string | number): ProviderMessageResult {
    if (r.ok && r.result?.message_id !== undefined) {
      return { ok: true, externalMessageId: `${r.result.chat?.id ?? chatId}:${r.result.message_id}`, status: "SENT", raw: r };
    }
    const code = r.error_code ?? r.httpStatus;
    const retryable = code === 0 || code === 429 || code >= 500;
    return { ok: false, errorCode: String(code), errorMessage: r.description ?? "Telegram request failed", retryable, raw: r };
  }

  async sendMessage(connection: ProviderConnection, to: OutboundRecipient, msg: OutboundMessage): Promise<ProviderMessageResult> {
    const conn = assertTelegram(connection);
    const chat_id = to.chatId ?? to.providerUserId;
    const reply_markup = keyboard(msg.buttons);
    if (msg.editMessageId) {
      const messageId = Number(msg.editMessageId.includes(":") ? msg.editMessageId.split(":").pop() : msg.editMessageId);
      const r = await this.call<{ message_id: number; chat?: { id: number } }>(conn.botToken, "editMessageText", {
        chat_id,
        message_id: messageId,
        text: msg.text,
        reply_markup,
      });
      if (r.ok) return { ok: true, externalMessageId: `${chat_id}:${messageId}`, status: "SENT", raw: r };
      // Fall through to sending a fresh message if the edit is not possible.
    }
    const r = await this.call<{ message_id: number; chat?: { id: number } }>(conn.botToken, "sendMessage", { chat_id, text: msg.text, reply_markup });
    return this.toResult(r, chat_id);
  }

  async sendTaskAssignment(connection: ProviderConnection, to: OutboundRecipient, content: AssignmentMessageContent): Promise<ProviderMessageResult> {
    return this.sendMessage(connection, to, {
      text: formatTelegramAssignment(content),
      buttons: [
        { label: "✅ Accept", data: content.acceptRef },
        { label: "❌ Reject", data: content.rejectRef },
        { label: "📋 Open Task", url: content.openUrl },
      ],
    });
  }

  /** Telegram sends X-Telegram-Bot-Api-Secret-Token when the webhook was registered with secret_token. */
  async verifyWebhook(connection: ProviderConnection | null, req: WebhookRequest): Promise<boolean> {
    if (req.method !== "POST") return false;
    const secret = connection && connection.provider === "TELEGRAM" ? connection.webhookSecret : process.env.TELEGRAM_WEBHOOK_SECRET;
    const header = req.headers["x-telegram-bot-api-secret-token"];
    if (!secret || !header) return false;
    return safeEqual(header, secret);
  }

  async parseWebhookEvent(payload: unknown, context?: { connectionHint?: string | null }): Promise<ParsedWebhook[]> {
    const u = payload as TgUpdate;
    if (!u || typeof u.update_id !== "number") return [];
    const hint = context?.connectionHint ?? null;
    const externalEventId = `update:${hint ?? "default"}:${u.update_id}`;
    if (u.callback_query?.from?.id !== undefined) {
      const cq = u.callback_query;
      return [
        {
          externalEventId,
          eventType: "callback_query",
          events: [
            {
              type: "BUTTON_CLICKED",
              provider: "TELEGRAM",
              providerUserId: String(cq.from!.id),
              chatId: cq.message?.chat?.id !== undefined ? String(cq.message.chat.id) : String(cq.from!.id),
              callbackData: cq.data ?? "",
              callbackQueryId: cq.id ?? "",
              messageId: cq.message?.message_id !== undefined ? String(cq.message.message_id) : null,
              username: cq.from!.username ?? null,
              displayName: [cq.from!.first_name, cq.from!.last_name].filter(Boolean).join(" ") || null,
              timestamp: new Date(),
              connectionHint: hint,
            },
          ],
        },
      ];
    }
    const m = u.message ?? u.edited_message;
    if (m?.from?.id !== undefined && m.message_id !== undefined) {
      return [
        {
          externalEventId,
          eventType: "message",
          events: [
            {
              type: "MESSAGE_RECEIVED",
              provider: "TELEGRAM",
              providerUserId: String(m.from.id),
              chatId: m.chat?.id !== undefined ? String(m.chat.id) : String(m.from.id),
              externalMessageId: `${m.chat?.id ?? m.from.id}:${m.message_id}`,
              text: m.text ?? m.caption ?? "",
              username: m.from.username ?? null,
              displayName: [m.from.first_name, m.from.last_name].filter(Boolean).join(" ") || null,
              timestamp: m.date ? new Date(m.date * 1000) : new Date(),
              connectionHint: hint,
            },
          ],
        },
      ];
    }
    return [{ externalEventId, eventType: "ignored", events: [] }];
  }

  async answerCallback(connection: ProviderConnection, callbackQueryId: string, text?: string) {
    const conn = assertTelegram(connection);
    await this.call(conn.botToken, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });
  }

  async registerWebhook(connection: ProviderConnection, url: string, secret: string) {
    const conn = assertTelegram(connection);
    const r = await this.call<boolean>(conn.botToken, "setWebhook", {
      url,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
    return { ok: !!r.ok, description: r.description };
  }

  async describeBot(connection: ProviderConnection) {
    const conn = assertTelegram(connection);
    const r = await this.call<{ id: number; username: string }>(conn.botToken, "getMe", {});
    if (!r.ok || !r.result) return null;
    return { id: String(r.result.id), username: r.result.username };
  }
}

interface TgUser { id: number; username?: string; first_name?: string; last_name?: string }
interface TgUpdate {
  update_id: number;
  message?: { message_id: number; from?: TgUser; chat?: { id: number }; date?: number; text?: string; caption?: string };
  edited_message?: TgUpdate["message"];
  callback_query?: { id?: string; from?: TgUser; message?: { message_id?: number; chat?: { id: number } }; data?: string };
}

let mockUpdateSeq = 1_000_000;
/** Build a Telegram update in the Bot API shape — used by mock console and tests. */
export function buildTelegramMessageUpdate(input: { userId: string; chatId?: string; text: string; username?: string; name?: string; updateId?: number }) {
  const id = input.updateId ?? ++mockUpdateSeq;
  return {
    update_id: id,
    message: {
      message_id: id,
      from: { id: Number(input.userId), is_bot: false, first_name: input.name ?? "Employee", username: input.username },
      chat: { id: Number(input.chatId ?? input.userId), type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: input.text,
    },
  };
}

export function buildTelegramCallbackUpdate(input: { userId: string; chatId?: string; data: string; messageId?: number; username?: string; name?: string; updateId?: number }) {
  const id = input.updateId ?? ++mockUpdateSeq;
  return {
    update_id: id,
    callback_query: {
      id: `cq-${id}`,
      from: { id: Number(input.userId), is_bot: false, first_name: input.name ?? "Employee", username: input.username },
      message: { message_id: input.messageId ?? 1, chat: { id: Number(input.chatId ?? input.userId), type: "private" } },
      chat_instance: "x",
      data: input.data,
    },
  };
}
