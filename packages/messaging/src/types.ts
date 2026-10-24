import type { MessagingProviderType } from "@trackwise/shared";

/** Decrypted, per-organization provider credentials handed to adapters. Never serialized to clients. */
export type ProviderConnection =
  | {
      provider: "WHATSAPP";
      connectionId: string;
      organizationId: string;
      phoneNumberId: string;
      accessToken: string;
      appSecret: string | null;
      verifyToken: string | null;
      assignmentTemplateName: string | null;
      graphApiVersion: string;
    }
  | {
      provider: "TELEGRAM";
      connectionId: string;
      organizationId: string;
      botToken: string;
      webhookSecret: string | null;
      botUsername: string | null;
    };

export interface OutboundRecipient {
  /** WhatsApp: E.164 phone. Telegram: numeric user id. */
  providerUserId: string;
  /** Telegram chat id (usually equals user id for private chats). */
  chatId?: string | null;
}

export interface InlineButton {
  label: string;
  /** Opaque callback data (signed by core), or a URL when `url` is set. */
  data?: string;
  url?: string;
}

export interface OutboundMessage {
  text: string;
  buttons?: InlineButton[];
  /** WhatsApp template fallback when outside the 24h window. */
  template?: { name: string; language?: string; bodyParams: string[] };
  /** Telegram: edit this message instead of sending a new one. */
  editMessageId?: string;
  parseMode?: "plain" | "markdown";
}

export type ProviderMessageResult =
  | { ok: true; externalMessageId: string; status: "SENT" | "QUEUED"; raw?: unknown }
  | { ok: false; errorCode: string; errorMessage: string; retryable: boolean; raw?: unknown };

export interface AssignmentMessageContent {
  assignmentId: string;
  taskTitle: string;
  projectName: string;
  clientName: string | null;
  dueLabel: string | null;
  estimateLabel: string | null;
  description: string | null;
  openUrl: string;
  /** Signed callback refs supplied by core (Telegram buttons). */
  acceptRef: string;
  rejectRef: string;
}

export interface WebhookRequest {
  method: string;
  headers: Record<string, string | undefined>;
  rawBody: string;
  query: Record<string, string | undefined>;
}

export type NormalizedMessagingEvent =
  | {
      type: "MESSAGE_RECEIVED";
      provider: MessagingProviderType;
      providerUserId: string;
      chatId: string | null;
      externalMessageId: string;
      text: string;
      phoneNumber?: string | null;
      username?: string | null;
      displayName?: string | null;
      timestamp: Date;
      /** WhatsApp: phone_number_id the message arrived on (identifies the org connection). */
      connectionHint?: string | null;
    }
  | {
      type: "BUTTON_CLICKED";
      provider: "TELEGRAM";
      providerUserId: string;
      chatId: string | null;
      callbackData: string;
      callbackQueryId: string;
      messageId: string | null;
      username?: string | null;
      displayName?: string | null;
      timestamp: Date;
      connectionHint?: string | null;
    }
  | {
      type: "MESSAGE_STATUS";
      provider: MessagingProviderType;
      externalMessageId: string;
      status: "SENT" | "DELIVERED" | "READ" | "FAILED";
      errorCode?: string | null;
      errorMessage?: string | null;
      timestamp: Date;
      connectionHint?: string | null;
    };

export interface ParsedWebhook {
  /** Stable id for idempotency (provider update id / message id / status composite). */
  externalEventId: string;
  eventType: string;
  events: NormalizedMessagingEvent[];
}

/** Provider adapter contract. Core never talks to Meta/Telegram directly. */
export interface MessagingProviderAdapter {
  readonly provider: MessagingProviderType;
  readonly isMock: boolean;
  sendMessage(conn: ProviderConnection, to: OutboundRecipient, msg: OutboundMessage): Promise<ProviderMessageResult>;
  sendTaskAssignment(conn: ProviderConnection, to: OutboundRecipient, content: AssignmentMessageContent): Promise<ProviderMessageResult>;
  verifyWebhook(conn: ProviderConnection | null, req: WebhookRequest): Promise<boolean>;
  parseWebhookEvent(payload: unknown, context?: { connectionHint?: string | null }): Promise<ParsedWebhook[]>;
  /** Telegram: acknowledge a callback query (stops the spinner). Optional for providers without callbacks. */
  answerCallback?(conn: ProviderConnection, callbackQueryId: string, text?: string): Promise<void>;
  /** Telegram: register the webhook with the provider. */
  registerWebhook?(conn: ProviderConnection, url: string, secret: string): Promise<{ ok: boolean; description?: string }>;
  /** Telegram: fetch bot identity (getMe). */
  describeBot?(conn: ProviderConnection): Promise<{ id: string; username: string } | null>;
}
