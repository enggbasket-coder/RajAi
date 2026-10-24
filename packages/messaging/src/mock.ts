import type {
  AssignmentMessageContent,
  MessagingProviderAdapter,
  OutboundMessage,
  OutboundRecipient,
  ParsedWebhook,
  ProviderConnection,
  ProviderMessageResult,
  WebhookRequest,
} from "./types";
import { formatTelegramAssignment, formatWhatsAppAssignment } from "./format";

export interface MockOutboundRecord {
  id: string;
  provider: "WHATSAPP" | "TELEGRAM";
  to: OutboundRecipient;
  message: OutboundMessage;
  at: Date;
}

export type MockFailureMode = "none" | "temporary" | "permanent";

interface MockState {
  seq: number;
  outbox: MockOutboundRecord[];
  failure: Record<"WHATSAPP" | "TELEGRAM", MockFailureMode>;
  /** Fail the next N sends then succeed (to exercise retry). */
  failNext: Record<"WHATSAPP" | "TELEGRAM", number>;
  answeredCallbacks: string[];
}

declare global {
  // eslint-disable-next-line no-var
  var __trackwiseMockMessaging: MockState | undefined;
}

function state(): MockState {
  if (!globalThis.__trackwiseMockMessaging) {
    globalThis.__trackwiseMockMessaging = {
      seq: 0,
      outbox: [],
      failure: { WHATSAPP: "none", TELEGRAM: "none" },
      failNext: { WHATSAPP: 0, TELEGRAM: 0 },
      answeredCallbacks: [],
    };
  }
  return globalThis.__trackwiseMockMessaging;
}

/** Test/dev controls for the mock providers. */
export const mockMessaging = {
  outbox: (): MockOutboundRecord[] => state().outbox,
  lastFor(provider: "WHATSAPP" | "TELEGRAM", providerUserId?: string) {
    const list = state().outbox.filter((r) => r.provider === provider && (!providerUserId || r.to.providerUserId === providerUserId));
    return list[list.length - 1] ?? null;
  },
  setFailure(provider: "WHATSAPP" | "TELEGRAM", mode: MockFailureMode) {
    state().failure[provider] = mode;
  },
  failNext(provider: "WHATSAPP" | "TELEGRAM", n: number) {
    state().failNext[provider] = n;
  },
  answeredCallbacks: () => state().answeredCallbacks,
  reset() {
    globalThis.__trackwiseMockMessaging = undefined;
  },
};

function record(provider: "WHATSAPP" | "TELEGRAM", to: OutboundRecipient, message: OutboundMessage): ProviderMessageResult {
  const s = state();
  if (s.failNext[provider] > 0) {
    s.failNext[provider] -= 1;
    return { ok: false, errorCode: "MOCK_TEMPORARY", errorMessage: "Simulated temporary provider failure", retryable: true };
  }
  if (s.failure[provider] === "temporary") {
    return { ok: false, errorCode: "MOCK_TEMPORARY", errorMessage: "Simulated temporary provider failure", retryable: true };
  }
  if (s.failure[provider] === "permanent") {
    return { ok: false, errorCode: "MOCK_PERMANENT", errorMessage: "Simulated permanent provider failure (e.g. recipient not reachable)", retryable: false };
  }
  s.seq += 1;
  // Editing an existing message keeps its id (like Telegram editMessageText); new messages get a restart-safe unique id.
  const id = message.editMessageId ?? `mock-${provider.toLowerCase()}-${Date.now().toString(36)}-${s.seq}`;
  s.outbox.push({ id, provider, to, message, at: new Date() });
  return { ok: true, externalMessageId: id, status: "SENT" };
}

type Parser = (payload: unknown, context?: { connectionHint?: string | null }) => Promise<ParsedWebhook[]>;

/**
 * Mock providers record outbound messages in memory and accept any webhook.
 * Parsing is delegated to the real provider parser so the dev console can submit
 * payloads in the provider's native shape and exercise the full inbound path.
 */
export class MockWhatsAppProvider implements MessagingProviderAdapter {
  readonly provider = "WHATSAPP" as const;
  readonly isMock = true;
  constructor(private readonly parser: Parser) {}
  async sendMessage(_c: ProviderConnection, to: OutboundRecipient, msg: OutboundMessage) {
    return record("WHATSAPP", to, msg);
  }
  async sendTaskAssignment(_c: ProviderConnection, to: OutboundRecipient, content: AssignmentMessageContent) {
    return record("WHATSAPP", to, { text: formatWhatsAppAssignment(content) });
  }
  async verifyWebhook(_c: ProviderConnection | null, _req: WebhookRequest) {
    return true;
  }
  parseWebhookEvent(payload: unknown, context?: { connectionHint?: string | null }) {
    return this.parser(payload, context);
  }
}

export class MockTelegramProvider implements MessagingProviderAdapter {
  readonly provider = "TELEGRAM" as const;
  readonly isMock = true;
  constructor(private readonly parser: Parser) {}
  async sendMessage(_c: ProviderConnection, to: OutboundRecipient, msg: OutboundMessage) {
    return record("TELEGRAM", to, msg);
  }
  async sendTaskAssignment(_c: ProviderConnection, to: OutboundRecipient, content: AssignmentMessageContent) {
    return record("TELEGRAM", to, {
      text: formatTelegramAssignment(content),
      buttons: [
        { label: "✅ Accept", data: content.acceptRef },
        { label: "❌ Reject", data: content.rejectRef },
        { label: "📋 Open Task", url: content.openUrl },
      ],
    });
  }
  async verifyWebhook() {
    return true;
  }
  parseWebhookEvent(payload: unknown, context?: { connectionHint?: string | null }) {
    return this.parser(payload, context);
  }
  async answerCallback(_c: ProviderConnection, callbackQueryId: string) {
    state().answeredCallbacks.push(callbackQueryId);
  }
  async registerWebhook() {
    return { ok: true, description: "mock" };
  }
  async describeBot() {
    return { id: "0", username: "trackwise_mock_bot" };
  }
}
