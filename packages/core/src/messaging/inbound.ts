/**
 * Inbound event processing: provider payload → normalized events → identity → conversation state → Trackwise core.
 * All business transitions go through AssignmentService / createAndAssignTask; nothing here is provider-specific
 * beyond choosing buttons (Telegram) vs numbered replies (WhatsApp).
 */
import { prisma, type ConversationState, type MessagingConversation, type Prisma, type UserMessagingIdentity } from "@trackwise/database";
import { resolveActor } from "@trackwise/auth";
import { hasPermission, isManagerial } from "@trackwise/rbac";
import {
  isAssignCommand,
  parseAssignCommandSync,
  parseAssignmentReply,
  parseChoice,
  parseConfirmationReply,
  parseDueDate,
  describeDue,
  sha256Hex,
  signRef,
  verifyRef,
  normalizePhone,
  randomToken,
} from "@trackwise/shared";
import type { MessagingProviderAdapter, NormalizedMessagingEvent, ProviderConnection, InlineButton } from "@trackwise/messaging";
import { WHATSAPP_REPLY_HINT } from "@trackwise/messaging";
import { APP_URL } from "../context";
import { AssignmentService } from "../tasks";
import { createAndAssignTask } from "../workflows";
import { notifyAssignmentAccepted, notifyAssignmentRejected } from "../notifications";
import { IdentityService } from "./identities";
import { findConnectionById, findWhatsAppConnectionByPhoneNumberId, getProvider } from "./providers";
import { MessagingService } from "./service";

export interface InboundContext {
  /** Telegram: the connection id from the webhook route. */
  connectionId?: string | null;
}

export interface InboundSummary {
  received: number;
  duplicates: number;
  processed: number;
  outcomes: string[];
}

type Channel = "WHATSAPP" | "TELEGRAM";

interface Draft {
  id: string;
  employee: string;
  project: string;
  title: string;
  due: string | null;
  assigneeUserId?: string;
  assigneeLabel?: string;
  projectId?: string;
  projectLabel?: string;
  dueAt?: string | null;
  options?: { id: string; label: string }[];
}

interface Ctx {
  organizationId: string;
  timezone: string;
  channel: Channel;
  conn: ProviderConnection;
  provider: MessagingProviderAdapter;
  identity: UserMessagingIdentity;
  conversation: MessagingConversation;
  member: { userId: string; role: "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE"; user: { id: string; email: string; name: string; timezone: string | null }; displayName: string | null };
  recipient: { providerUserId: string; chatId: string | null };
  event: Extract<NormalizedMessagingEvent, { type: "MESSAGE_RECEIVED" | "BUTTON_CLICKED" }>;
}

export async function processInboundEvent(provider: Channel, payload: unknown, context: InboundContext = {}): Promise<InboundSummary> {
  const adapter = getProvider(provider);
  const parsed = await adapter.parseWebhookEvent(payload, { connectionHint: context.connectionId ?? null });
  const summary: InboundSummary = { received: parsed.length, duplicates: 0, processed: 0, outcomes: [] };

  for (const webhook of parsed) {
    // Resolve the organization connection for this webhook.
    let resolved: Awaited<ReturnType<typeof findConnectionById>> = null;
    if (provider === "TELEGRAM") {
      resolved = context.connectionId ? await findConnectionById(context.connectionId) : null;
    } else {
      const hint = webhook.events.find((e) => e.connectionHint)?.connectionHint ?? null;
      resolved = await findWhatsAppConnectionByPhoneNumberId(hint);
    }
    const organizationId = resolved?.row.organizationId ?? null;

    // Idempotency: store the event first; a duplicate external id means we already handled it.
    const payloadHash = sha256Hex(JSON.stringify(payload));
    const seen = await prisma.messagingWebhookEvent.findUnique({ where: { provider_externalEventId: { provider, externalEventId: webhook.externalEventId } } });
    if (seen) {
      summary.duplicates += 1;
      summary.outcomes.push("DUPLICATE_EVENT");
      continue;
    }
    let eventRow;
    try {
      eventRow = await prisma.messagingWebhookEvent.create({
        data: { organizationId, provider, externalEventId: webhook.externalEventId, eventType: webhook.eventType, payloadHash, payloadJson: payload as Prisma.InputJsonValue },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        summary.duplicates += 1;
        summary.outcomes.push("DUPLICATE_EVENT");
        continue;
      }
      throw e;
    }

    const outcomes: string[] = [];
    try {
      if (!resolved || !resolved.conn || !resolved.row.enabled || resolved.row.provider !== provider) {
        outcomes.push("UNKNOWN_CONNECTION");
      } else {
        for (const ev of webhook.events) {
          outcomes.push(await handleEvent(ev, resolved.row.organizationId, resolved.conn, adapter));
        }
      }
      await prisma.messagingWebhookEvent.update({ where: { id: eventRow.id }, data: { processed: true, processedAt: new Date(), error: null } });
    } catch (e) {
      await prisma.messagingWebhookEvent.update({ where: { id: eventRow.id }, data: { processed: true, processedAt: new Date(), error: (e as Error).message.slice(0, 500) } });
      outcomes.push(`ERROR:${(e as Error).message}`);
    }
    summary.processed += 1;
    summary.outcomes.push(...outcomes);
  }
  return summary;
}

async function handleEvent(ev: NormalizedMessagingEvent, organizationId: string, conn: ProviderConnection, adapter: MessagingProviderAdapter): Promise<string> {
  if (ev.type === "MESSAGE_STATUS") {
    const r = await MessagingService.applyMessageStatus(ev.provider, ev.externalMessageId, ev.status, { code: ev.errorCode, message: ev.errorMessage }, ev.timestamp);
    return r.matchedDelivery || r.matchedMessage ? `STATUS_${ev.status}` : "STATUS_UNMATCHED";
  }
  const channel = ev.provider;
  const sender = await IdentityService.resolveSender(organizationId, channel, ev.providerUserId);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  if (!sender) return handleUnknownSender(ev, organizationId, conn, adapter);

  // Record the inbound message (unique per provider message id → duplicate inbound is ignored).
  const externalMessageId = ev.type === "BUTTON_CLICKED" ? `cb:${ev.callbackQueryId}` : ev.externalMessageId;
  const dupe = await prisma.communicationMessage.findUnique({ where: { channel_direction_externalMessageId: { channel, direction: "INBOUND", externalMessageId } } });
  if (dupe) return "DUPLICATE_MESSAGE";
  try {
    await prisma.communicationMessage.create({
      data: {
        organizationId,
        channel,
        direction: "INBOUND",
        messageType: ev.type === "BUTTON_CLICKED" ? "CALLBACK" : "TEXT",
        userId: sender.member.userId,
        externalMessageId,
        body: ev.type === "BUTTON_CLICKED" ? ev.callbackData : ev.text,
        status: "RECEIVED",
        receivedAt: ev.timestamp,
        metadataJson: { username: ev.username ?? null, displayName: ev.displayName ?? null } as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return "DUPLICATE_MESSAGE";
    throw e;
  }

  const conversation =
    sender.identity.conversation ??
    (await prisma.messagingConversation.create({ data: { organizationId, identityId: sender.identity.id } }));

  const ctx: Ctx = {
    organizationId,
    timezone: org.timezone,
    channel,
    conn,
    provider: adapter,
    identity: sender.identity,
    conversation,
    member: { userId: sender.member.userId, role: sender.member.role, user: sender.member.user, displayName: sender.member.displayName },
    recipient: { providerUserId: sender.identity.providerUserId, chatId: ev.chatId ?? sender.identity.providerChatId },
    event: ev,
  };
  return ev.type === "BUTTON_CLICKED" ? handleCallback(ctx) : handleText(ctx, ev.text);
}

// ───────────────────────── helpers ─────────────────────────

async function reply(ctx: Ctx, text: string, opts: { buttons?: InlineButton[]; editMessageId?: string; taskId?: string | null; taskAssignmentId?: string | null; state?: ConversationState } = {}) {
  return MessagingService.sendRaw({
    organizationId: ctx.organizationId,
    userId: ctx.member.userId,
    channel: ctx.channel,
    conn: ctx.conn,
    recipient: ctx.recipient,
    text,
    buttons: ctx.channel === "TELEGRAM" ? opts.buttons : undefined,
    editMessageId: opts.editMessageId,
    taskId: opts.taskId,
    taskAssignmentId: opts.taskAssignmentId,
    conversationState: opts.state,
  });
}

async function setState(ctx: Ctx, state: ConversationState, context: Record<string, unknown> = {}) {
  ctx.conversation = await prisma.messagingConversation.update({ where: { id: ctx.conversation.id }, data: { state, contextJson: context as Prisma.InputJsonValue } });
}

function convCtx<T = Record<string, unknown>>(ctx: Ctx): T {
  return (ctx.conversation.contextJson ?? {}) as T;
}

async function answer(ctx: Ctx, text?: string) {
  if (ctx.event.type === "BUTTON_CLICKED" && ctx.provider.answerCallback) await ctx.provider.answerCallback(ctx.conn, ctx.event.callbackQueryId, text);
}

const taskUrl = (taskId: string) => `${APP_URL()}/tasks/${taskId}`;
const timerUrl = (taskId: string) => `${APP_URL()}/timer?task=${taskId}`;

async function handleUnknownSender(ev: Extract<NormalizedMessagingEvent, { type: "MESSAGE_RECEIVED" | "BUTTON_CLICKED" }>, organizationId: string, conn: ProviderConnection, adapter: MessagingProviderAdapter): Promise<string> {
  if (ev.provider === "TELEGRAM" && ev.type === "MESSAGE_RECEIVED") {
    const m = /^\/start(?:@\w+)?(?:\s+(\S+))?/i.exec(ev.text.trim());
    const recipient = { providerUserId: ev.providerUserId, chatId: ev.chatId };
    if (m?.[1]) {
      const identity = await IdentityService.consumeTelegramLinkToken(organizationId, m[1], { userId: ev.providerUserId, chatId: ev.chatId, username: ev.username });
      if (identity) {
        const user = await prisma.user.findUnique({ where: { id: identity.userId } });
        await MessagingService.sendRaw({ organizationId, userId: identity.userId, channel: "TELEGRAM", conn, recipient, text: `Telegram connected ✅\nHi ${user?.name ?? ""}! You'll receive Trackwise task assignments here.`, messageType: "SYSTEM" });
        return "TELEGRAM_LINKED";
      }
      await MessagingService.sendRaw({ organizationId, userId: null, channel: "TELEGRAM", conn, recipient, text: "That link code is invalid or has expired. Open Trackwise → Settings → Messaging → Connect Telegram to get a new one.", messageType: "SYSTEM" });
      return "TELEGRAM_LINK_INVALID";
    }
    await MessagingService.sendRaw({ organizationId, userId: null, channel: "TELEGRAM", conn, recipient, text: "This Telegram account is not linked to Trackwise.\nOpen Trackwise → Settings → Messaging → Connect Telegram, then send the code here as /start TW-XXXXXX.", messageType: "SYSTEM" });
    return "UNKNOWN_TELEGRAM_USER";
  }
  if (ev.provider === "TELEGRAM" && ev.type === "BUTTON_CLICKED" && adapter.answerCallback) {
    await adapter.answerCallback(conn, ev.callbackQueryId, "This Telegram account is not linked to Trackwise.");
    return "UNKNOWN_TELEGRAM_USER";
  }
  // Unknown WhatsApp number: never create a user, never reply (avoid messaging arbitrary numbers).
  await prisma.auditLog.create({ data: { organizationId, action: "messaging.unknown_sender", entityType: "MessagingWebhookEvent", metadataJson: { provider: ev.provider, sender: ev.providerUserId.slice(0, 4) + "…" } } });
  return "UNKNOWN_WHATSAPP_NUMBER";
}

// ───────────────────────── callbacks (Telegram) ─────────────────────────

async function handleCallback(ctx: Ctx): Promise<string> {
  const ev = ctx.event as Extract<NormalizedMessagingEvent, { type: "BUTTON_CLICKED" }>;
  const ref = verifyRef(ev.callbackData);
  if (!ref) {
    await answer(ctx, "This button is no longer valid.");
    return "CALLBACK_INVALID";
  }
  if (ref.prefix === "acc" || ref.prefix === "rej") {
    const a = await AssignmentService.load(ref.id, ctx.organizationId);
    if (!a || a.userId !== ctx.member.userId) {
      await answer(ctx, "This task is not assigned to you.");
      return "CALLBACK_FORBIDDEN";
    }
    if (ref.prefix === "acc") return acceptAssignment(ctx, a.id, ev.messageId);
    if (a.status !== "PENDING") {
      await answer(ctx, a.status === "ACCEPTED" ? "This task has already been accepted." : "This task is no longer pending.");
      return "ALREADY_RESPONDED";
    }
    await setState(ctx, "AWAITING_REJECTION_REASON", { assignmentId: a.id });
    await answer(ctx);
    await reply(ctx, "Please send a short reason for rejecting this task.", { taskId: a.taskId, taskAssignmentId: a.id, state: "AWAITING_REJECTION_REASON" });
    return "AWAITING_REJECTION_REASON";
  }
  if (ref.prefix === "cc" || ref.prefix === "cx" || ref.prefix === "pk") {
    const draft = convCtx<{ draft?: Draft }>(ctx).draft;
    const [draftId, choice] = ref.id.split(".");
    if (!draft || draft.id !== draftId) {
      await answer(ctx, "This confirmation has expired.");
      return "CONFIRMATION_EXPIRED";
    }
    if (!isAuthorizedManager(ctx)) {
      await answer(ctx, "You do not have permission to assign tasks.");
      return "COMMAND_FORBIDDEN";
    }
    await answer(ctx);
    if (ref.prefix === "cx") {
      await setState(ctx, "IDLE");
      await reply(ctx, "Cancelled. No task was created.", { editMessageId: ev.messageId ?? undefined });
      return "COMMAND_CANCELLED";
    }
    if (ref.prefix === "cc") {
      if (ctx.conversation.state !== "AWAITING_ASSIGN_CONFIRMATION") {
        await reply(ctx, "This confirmation has expired.");
        return "CONFIRMATION_EXPIRED";
      }
      return executeDraft(ctx, draft, ev.messageId);
    }
    return applyChoice(ctx, draft, Number(choice));
  }
  await answer(ctx, "Unknown action.");
  return "CALLBACK_UNKNOWN";
}

// ───────────────────────── text messages ─────────────────────────

async function handleText(ctx: Ctx, rawText: string): Promise<string> {
  const text = (rawText || "").trim();
  if (ctx.channel === "TELEGRAM" && /^\/start/i.test(text)) {
    await reply(ctx, "You're already connected ✅ Task assignments will arrive here.");
    return "ALREADY_LINKED";
  }
  if (/^\/?(help|start)$/i.test(text)) {
    await reply(ctx, helpText(ctx));
    return "HELP";
  }

  switch (ctx.conversation.state) {
    case "AWAITING_REJECTION_REASON":
      return finishRejection(ctx, text);
    case "AWAITING_ASSIGN_CONFIRMATION": {
      if (isAssignCommand(text)) return startCommand(ctx, text);
      const c = parseConfirmationReply(text);
      const draft = convCtx<{ draft?: Draft }>(ctx).draft;
      if (!draft) {
        await setState(ctx, "IDLE");
        break;
      }
      if (c === "YES") return executeDraft(ctx, draft, null);
      if (c === "NO") {
        await setState(ctx, "IDLE");
        await reply(ctx, "Cancelled. No task was created.");
        return "COMMAND_CANCELLED";
      }
      await reply(ctx, "Reply YES to create the task or NO to cancel.");
      return "AWAITING_ASSIGN_CONFIRMATION";
    }
    case "AWAITING_ASSIGNEE_CHOICE":
    case "AWAITING_PROJECT_CHOICE": {
      if (isAssignCommand(text)) return startCommand(ctx, text);
      const draft = convCtx<{ draft?: Draft }>(ctx).draft;
      if (!draft?.options) {
        await setState(ctx, "IDLE");
        break;
      }
      const n = parseChoice(text, draft.options.length);
      if (!n) {
        await reply(ctx, `Please reply with a number between 1 and ${draft.options.length}.`);
        return ctx.conversation.state;
      }
      return applyChoice(ctx, draft, n);
    }
    case "AWAITING_DUE_CLARIFICATION": {
      if (isAssignCommand(text)) return startCommand(ctx, text);
      const draft = convCtx<{ draft?: Draft }>(ctx).draft;
      if (!draft) {
        await setState(ctx, "IDLE");
        break;
      }
      if (/^(skip|none|no due)$/i.test(text)) {
        draft.due = null;
        draft.dueAt = null;
        return continueDraft(ctx, draft);
      }
      const d = parseDueDate(text, ctx.timezone);
      if (!d.ok) {
        await reply(ctx, `${d.message}\nReply with a date, or SKIP for no due date.`);
        return "AWAITING_DUE_CLARIFICATION";
      }
      draft.due = text;
      draft.dueAt = d.date.toISOString();
      return continueDraft(ctx, draft);
    }
    default:
      break;
  }

  if (isAssignCommand(text)) return startCommand(ctx, text);
  return handleEmployeeReply(ctx, text);
}

function helpText(ctx: Ctx) {
  const lines = ["Trackwise", "Reply 1 to accept or 2 to reject a task you were sent."];
  if (isAuthorizedManager(ctx)) lines.push("Managers: assign <employee> | <project> | <task> | due <date>");
  lines.push(`Open Trackwise: ${APP_URL()}`);
  return lines.join("\n");
}

// ───────────────────────── employee accept/reject ─────────────────────────

async function candidateAssignments(ctx: Ctx) {
  const pending = await prisma.taskAssignment.findMany({
    where: { organizationId: ctx.organizationId, userId: ctx.member.userId, status: "PENDING", deliveries: { some: { channel: ctx.channel, status: { not: "QUEUED" } } } },
    orderBy: { assignedAt: "desc" },
    include: { task: true },
  });
  const latest = await prisma.taskAssignment.findFirst({
    where: { organizationId: ctx.organizationId, userId: ctx.member.userId, deliveries: { some: { channel: ctx.channel } } },
    orderBy: { assignedAt: "desc" },
    include: { task: true },
  });
  return { pending, latest };
}

async function handleEmployeeReply(ctx: Ctx, text: string): Promise<string> {
  const intent = parseAssignmentReply(text);
  const { pending, latest } = await candidateAssignments(ctx);
  const target = pending[0] ?? null;

  if (intent === "UNKNOWN") {
    if (target && !target.invalidReplyPromptedAt) {
      await prisma.taskAssignment.update({ where: { id: target.id }, data: { invalidReplyPromptedAt: new Date() } });
      await reply(ctx, WHATSAPP_REPLY_HINT, { taskId: target.taskId, taskAssignmentId: target.id });
      return "INVALID_REPLY_PROMPTED";
    }
    return "IGNORED";
  }

  if (!target) {
    if (latest?.status === "ACCEPTED") {
      await reply(ctx, `This task has already been accepted.\n${latest.task.title}`, { taskId: latest.taskId, taskAssignmentId: latest.id });
      return "ALREADY_ACCEPTED";
    }
    if (latest?.status === "REJECTED") {
      await reply(ctx, `This task was already rejected.\n${latest.task.title}`, { taskId: latest.taskId, taskAssignmentId: latest.id });
      return "ALREADY_REJECTED";
    }
    await reply(ctx, "You have no pending tasks right now.");
    return "NO_PENDING";
  }

  if (intent === "ACCEPT") return acceptAssignment(ctx, target.id, null);

  await setState(ctx, "AWAITING_REJECTION_REASON", { assignmentId: target.id });
  await reply(ctx, "Please reply with a short reason for rejecting this task.", { taskId: target.taskId, taskAssignmentId: target.id, state: "AWAITING_REJECTION_REASON" });
  return "AWAITING_REJECTION_REASON";
}

async function acceptAssignment(ctx: Ctx, assignmentId: string, telegramMessageId: string | null): Promise<string> {
  const r = await AssignmentService.respond({ organizationId: ctx.organizationId, assignmentId, userId: ctx.member.userId, action: "ACCEPT", via: ctx.channel });
  const title = r.assignment.task.title;
  if (r.changed) {
    await answer(ctx, "Task accepted ✅");
    if (ctx.channel === "TELEGRAM") {
      await reply(ctx, `✅ Accepted\n${title}`, { editMessageId: telegramMessageId ?? undefined, buttons: [{ label: "▶ Open Timer", url: timerUrl(r.assignment.taskId) }], taskId: r.assignment.taskId, taskAssignmentId: assignmentId });
    } else {
      await reply(ctx, `Task accepted ✅\n${title}\nOpen Trackwise:\n${timerUrl(r.assignment.taskId)}`, { taskId: r.assignment.taskId, taskAssignmentId: assignmentId });
      await reflectAcceptanceOnTelegram(ctx, assignmentId);
    }
    await notifyAssignmentAccepted(assignmentId);
    return "ACCEPTED";
  }
  const msg = r.outcome === "ALREADY_ACCEPTED" ? "This task has already been accepted." : r.outcome === "ALREADY_REJECTED" ? "This task was already rejected." : "This task is no longer available.";
  await answer(ctx, msg);
  if (ctx.event.type === "MESSAGE_RECEIVED") await reply(ctx, `${msg}\n${title}`, { taskId: r.assignment.taskId, taskAssignmentId: assignmentId });
  return r.outcome;
}

/** When accepted via WhatsApp and a Telegram copy exists, update the Telegram message so both channels agree. */
async function reflectAcceptanceOnTelegram(ctx: Ctx, assignmentId: string) {
  const tg = await prisma.assignmentDelivery.findUnique({ where: { taskAssignmentId_channel: { taskAssignmentId: assignmentId, channel: "TELEGRAM" } } });
  if (!tg?.externalMessageId) return;
  const a = await AssignmentService.load(assignmentId, ctx.organizationId);
  if (!a) return;
  await MessagingService.sendToUser({ organizationId: ctx.organizationId, userId: ctx.member.userId, channel: "TELEGRAM", text: `✅ Accepted (via WhatsApp)\n${a.task.title}`, editMessageId: tg.externalMessageId, buttons: [{ label: "▶ Open Timer", url: timerUrl(a.taskId) }], taskId: a.taskId, taskAssignmentId: assignmentId, messageType: "SYSTEM" });
}

async function finishRejection(ctx: Ctx, reason: string): Promise<string> {
  const { assignmentId } = convCtx<{ assignmentId?: string }>(ctx);
  if (!assignmentId) {
    await setState(ctx, "IDLE");
    return handleEmployeeReply(ctx, reason);
  }
  if (!reason) {
    await reply(ctx, "Please send a short reason for rejecting this task.");
    return "AWAITING_REJECTION_REASON";
  }
  const r = await AssignmentService.respond({ organizationId: ctx.organizationId, assignmentId, userId: ctx.member.userId, action: "REJECT", reason, via: ctx.channel });
  await setState(ctx, "IDLE");
  if (r.changed) {
    await reply(ctx, `Task rejected ❌\n${r.assignment.task.title}\nYour manager has been notified.`, { taskId: r.assignment.taskId, taskAssignmentId: assignmentId });
    await notifyAssignmentRejected(assignmentId);
    return "REJECTED";
  }
  await reply(ctx, r.outcome === "ALREADY_ACCEPTED" ? "This task has already been accepted." : "This task was already closed.", { taskId: r.assignment.taskId, taskAssignmentId: assignmentId });
  return r.outcome;
}

// ───────────────────────── manager commands ─────────────────────────

function isAuthorizedManager(ctx: Ctx) {
  return isManagerial(ctx.member.role) && hasPermission(ctx.member.role, "tasks:assign");
}

async function startCommand(ctx: Ctx, text: string): Promise<string> {
  if (!isAuthorizedManager(ctx)) {
    await reply(ctx, "You do not have permission to assign tasks.");
    return "COMMAND_FORBIDDEN";
  }
  const parsed = parseAssignCommandSync(text);
  if (!parsed || "error" in parsed) {
    await reply(ctx, parsed && "error" in parsed ? parsed.error : "Format: assign <employee> | <project> | <task> | due <date>");
    return "COMMAND_INVALID";
  }
  const draft: Draft = { id: randomToken(6), employee: parsed.employee, project: parsed.project, title: parsed.title, due: parsed.due };
  return continueDraft(ctx, draft);
}

async function resolveAssignee(ctx: Ctx, query: string): Promise<{ ok: { userId: string; label: string } } | { ambiguous: { id: string; label: string }[] } | { none: true }> {
  const q = query.trim();
  const members = await prisma.organizationMember.findMany({ where: { organizationId: ctx.organizationId, active: true }, include: { user: { include: { messagingIdentities: { where: { organizationId: ctx.organizationId, provider: "WHATSAPP" } } } } } });
  const label = (m: (typeof members)[number]) => m.displayName || m.user.name;
  const one = (m: (typeof members)[number]) => ({ ok: { userId: m.userId, label: label(m) } });
  // 1. exact internal id
  let hit = members.find((m) => m.userId === q || m.id === q);
  if (hit) return one(hit);
  // 2. exact phone
  const phone = normalizePhone(q);
  if (phone) {
    hit = members.find((m) => m.user.messagingIdentities.some((i) => i.providerUserId === phone));
    if (hit) return one(hit);
  }
  // 3. exact email
  hit = members.find((m) => m.user.email === q.toLowerCase());
  if (hit) return one(hit);
  // 4. exact display name (case-sensitive)
  const exact = members.filter((m) => label(m) === q || m.user.name === q);
  if (exact.length === 1) return one(exact[0]);
  if (exact.length > 1) return { ambiguous: exact.map((m) => ({ id: m.userId, label: label(m) })).sort((x, y) => x.label.localeCompare(y.label)) };
  // 5. unique case-insensitive name match (full name, or first name / prefix)
  const lq = q.toLowerCase();
  const ci = members.filter((m) => {
    const n = label(m).toLowerCase();
    return n === lq || n.split(/\s+/)[0] === lq || n.startsWith(lq + " ");
  });
  if (ci.length === 1) return one(ci[0]);
  if (ci.length > 1) return { ambiguous: ci.map((m) => ({ id: m.userId, label: label(m) })).sort((x, y) => x.label.localeCompare(y.label)) };
  return { none: true };
}

async function resolveProject(ctx: Ctx, query: string): Promise<{ ok: { projectId: string; label: string } } | { ambiguous: { id: string; label: string }[] } | { none: true }> {
  const q = query.trim();
  const projects = await prisma.project.findMany({ where: { organizationId: ctx.organizationId, archived: false, status: { in: ["ACTIVE", "PAUSED"] } } });
  let hit = projects.find((p) => p.code && p.code.toLowerCase() === q.toLowerCase());
  if (hit) return { ok: { projectId: hit.id, label: hit.name } };
  hit = projects.find((p) => p.name === q);
  if (hit) return { ok: { projectId: hit.id, label: hit.name } };
  const lq = q.toLowerCase();
  const ci = projects.filter((p) => p.name.toLowerCase() === lq);
  if (ci.length === 1) return { ok: { projectId: ci[0].id, label: ci[0].name } };
  if (ci.length > 1) return { ambiguous: ci.map((p) => ({ id: p.id, label: p.name })).sort((x, y) => x.label.localeCompare(y.label)) };
  const partial = projects.filter((p) => p.name.toLowerCase().includes(lq));
  if (partial.length === 1) return { ok: { projectId: partial[0].id, label: partial[0].name } };
  if (partial.length > 1) return { ambiguous: partial.map((p) => ({ id: p.id, label: p.name })).sort((x, y) => x.label.localeCompare(y.label)) };
  return { none: true };
}

function optionsText(prefix: string, options: { label: string }[]) {
  return `${prefix}\n${options.map((o, i) => `${i + 1}. ${o.label}`).join("\n")}\nReply with ${options.map((_, i) => i + 1).join(" or ")}.`;
}

function optionButtons(draft: Draft, options: { label: string }[]): InlineButton[] {
  return options.map((o, i) => ({ label: `${i + 1}. ${o.label}`, data: signRef("pk", `${draft.id}.${i + 1}`) }));
}

async function continueDraft(ctx: Ctx, draft: Draft): Promise<string> {
  if (!draft.assigneeUserId) {
    const r = await resolveAssignee(ctx, draft.employee);
    if ("none" in r) {
      await setState(ctx, "IDLE");
      await reply(ctx, `No employee named "${draft.employee}" found in your organization.`);
      return "ASSIGNEE_NOT_FOUND";
    }
    if ("ambiguous" in r) {
      draft.options = r.ambiguous;
      await setState(ctx, "AWAITING_ASSIGNEE_CHOICE", { draft });
      await reply(ctx, optionsText(`${r.ambiguous.length} employees match "${draft.employee}":`, r.ambiguous), { buttons: optionButtons(draft, r.ambiguous), state: "AWAITING_ASSIGNEE_CHOICE" });
      return "AWAITING_ASSIGNEE_CHOICE";
    }
    draft.assigneeUserId = r.ok.userId;
    draft.assigneeLabel = r.ok.label;
  }
  if (!draft.projectId) {
    const r = await resolveProject(ctx, draft.project);
    if ("none" in r) {
      await setState(ctx, "IDLE");
      await reply(ctx, `No project matching "${draft.project}" found.`);
      return "PROJECT_NOT_FOUND";
    }
    if ("ambiguous" in r) {
      draft.options = r.ambiguous;
      await setState(ctx, "AWAITING_PROJECT_CHOICE", { draft });
      await reply(ctx, optionsText(`${r.ambiguous.length} projects match "${draft.project}":`, r.ambiguous), { buttons: optionButtons(draft, r.ambiguous), state: "AWAITING_PROJECT_CHOICE" });
      return "AWAITING_PROJECT_CHOICE";
    }
    draft.projectId = r.ok.projectId;
    draft.projectLabel = r.ok.label;
  }
  if (draft.due && draft.dueAt === undefined) {
    const d = parseDueDate(draft.due, ctx.timezone);
    if (!d.ok) {
      await setState(ctx, "AWAITING_DUE_CLARIFICATION", { draft });
      await reply(ctx, `${d.message}\nReply with a date, or SKIP for no due date.`, { state: "AWAITING_DUE_CLARIFICATION" });
      return "AWAITING_DUE_CLARIFICATION";
    }
    draft.dueAt = d.date.toISOString();
  }
  draft.options = undefined;
  await setState(ctx, "AWAITING_ASSIGN_CONFIRMATION", { draft });
  const dueLabel = draft.dueAt ? describeDue(new Date(draft.dueAt), ctx.timezone) : "No due date";
  if (ctx.channel === "TELEGRAM") {
    await reply(ctx, `Create this task?\n👤 ${draft.assigneeLabel}\n📁 ${draft.projectLabel}\n📋 ${draft.title}\n📅 ${dueLabel}`, {
      buttons: [{ label: "✅ Create Task", data: signRef("cc", draft.id) }, { label: "❌ Cancel", data: signRef("cx", draft.id) }],
      state: "AWAITING_ASSIGN_CONFIRMATION",
    });
  } else {
    await reply(ctx, `Create this task?\nEmployee: ${draft.assigneeLabel}\nProject: ${draft.projectLabel}\nTask: ${draft.title}\nDue: ${dueLabel}\nReply YES to confirm\nReply NO to cancel`, { state: "AWAITING_ASSIGN_CONFIRMATION" });
  }
  return "AWAITING_ASSIGN_CONFIRMATION";
}

async function applyChoice(ctx: Ctx, draft: Draft, n: number): Promise<string> {
  const opt = draft.options?.[n - 1];
  if (!opt) {
    await reply(ctx, "That option is not available.");
    return ctx.conversation.state;
  }
  if (ctx.conversation.state === "AWAITING_ASSIGNEE_CHOICE") {
    draft.assigneeUserId = opt.id;
    draft.assigneeLabel = opt.label;
  } else if (ctx.conversation.state === "AWAITING_PROJECT_CHOICE") {
    draft.projectId = opt.id;
    draft.projectLabel = opt.label;
  } else {
    await reply(ctx, "This choice has expired.");
    return "CHOICE_EXPIRED";
  }
  draft.options = undefined;
  return continueDraft(ctx, draft);
}

async function executeDraft(ctx: Ctx, draft: Draft, editMessageId: string | null): Promise<string> {
  const actor = await resolveActor(ctx.member.user, ctx.organizationId);
  if (!actor || !isAuthorizedManager(ctx) || !draft.assigneeUserId || !draft.projectId) {
    await setState(ctx, "IDLE");
    await reply(ctx, "You do not have permission to assign tasks.");
    return "COMMAND_FORBIDDEN";
  }
  await setState(ctx, "IDLE");
  const { task, sends } = await createAndAssignTask(actor, {
    projectId: draft.projectId,
    title: draft.title,
    dueAt: draft.dueAt ? new Date(draft.dueAt) : null,
    assigneeUserIds: [draft.assigneeUserId],
    sendVia: "PREFERENCE",
    retryDelaysMs: process.env.NODE_ENV === "test" ? [0, 0, 0] : undefined,
  });
  const deliveries = sends.flatMap((s) => s.deliveries).map((d) => `${d.channel === "WHATSAPP" ? "WhatsApp" : d.channel === "TELEGRAM" ? "Telegram" : "Web"}: ${d.status.toLowerCase()}${d.errorMessage ? ` (${d.errorMessage})` : ""}`);
  await reply(ctx, `Task created ✅\n${draft.title}\nAssigned to ${draft.assigneeLabel}\n${deliveries.join("\n")}\n${taskUrl(task.id)}`, { editMessageId: editMessageId ?? undefined, taskId: task.id });
  return "TASK_CREATED";
}
