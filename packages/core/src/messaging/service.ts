import { prisma, type AssignmentDelivery, type DeliveryChannel, type DeliveryStatus, type Prisma } from "@trackwise/database";
import { describeDue, forbidden, notFound, signRef, type SendVia } from "@trackwise/shared";
import { formatEstimate, type AssignmentMessageContent, type InlineButton, type OutboundMessage, type ProviderConnection, type ProviderMessageResult } from "@trackwise/messaging";
import { AuditService } from "../audit";
import { APP_URL, requirePermission, type Actor } from "../context";
import { getEnabledConnection, getProvider } from "./providers";

export interface SendAssignmentOptions {
  sendVia?: SendVia;
  actorUserId?: string | null;
  /** Retry delays in ms between attempts; defaults to [0, 2000, 5000]. Tests pass [0,0,0]. */
  retryDelaysMs?: number[];
  /** Only (re)send these channels — used by retry. */
  onlyChannels?: DeliveryChannel[];
}

export interface ChannelSendResult {
  channel: DeliveryChannel;
  status: DeliveryStatus;
  externalMessageId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface SendResult {
  assignmentId: string;
  deliveries: ChannelSendResult[];
}

export const DEFAULT_RETRY_DELAYS_MS = [0, 2000, 5000];

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

function asJson(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v ?? {}));
}

/** Readiness of a user's channel: connection enabled + verified identity (+ opt-in for WhatsApp). */
export async function channelReadiness(organizationId: string, userId: string, channel: "WHATSAPP" | "TELEGRAM") {
  const connection = await getEnabledConnection(organizationId, channel);
  if (!connection || !connection.conn) return { ready: false as const, reason: `${channel === "WHATSAPP" ? "WhatsApp" : "Telegram"} is not connected for this organization`, code: "CHANNEL_NOT_CONFIGURED" };
  const identity = await prisma.userMessagingIdentity.findUnique({ where: { organizationId_userId_provider: { organizationId, userId, provider: channel } } });
  if (!identity || identity.disabled) return { ready: false as const, reason: `${channel === "WHATSAPP" ? "WhatsApp" : "Telegram"} unavailable — employee has not connected it.`, code: "IDENTITY_MISSING" };
  if (!identity.verified) return { ready: false as const, reason: `${channel === "WHATSAPP" ? "WhatsApp number" : "Telegram account"} is not verified.`, code: "IDENTITY_UNVERIFIED" };
  if (channel === "WHATSAPP" && !identity.optedIn) return { ready: false as const, reason: "WhatsApp unavailable — employee has not opted in.", code: "NOT_OPTED_IN" };
  return { ready: true as const, identity, conn: connection.conn, connectionRow: connection.row };
}

/** Decide which channels an assignment should go to. */
export async function resolveChannels(organizationId: string, userId: string, sendVia: SendVia): Promise<DeliveryChannel[]> {
  if (sendVia === "WEB") return ["WEB"];
  if (sendVia === "WHATSAPP" || sendVia === "TELEGRAM") return [sendVia];
  if (sendVia === "BOTH") return ["WHATSAPP", "TELEGRAM"];
  const member = await prisma.organizationMember.findFirst({ where: { organizationId, userId } });
  const pref = member?.preferredAssignmentChannel ?? "DEFAULT";
  if (pref === "BOTH") return ["WHATSAPP", "TELEGRAM"];
  if (pref === "WHATSAPP" || pref === "TELEGRAM") return [pref];
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (org.defaultManagementChannel === "WEB") return ["WEB"];
  return [org.defaultManagementChannel];
}

async function upsertDelivery(organizationId: string, taskAssignmentId: string, channel: DeliveryChannel) {
  return prisma.assignmentDelivery.upsert({
    where: { taskAssignmentId_channel: { taskAssignmentId, channel } },
    create: { organizationId, taskAssignmentId, channel, status: "QUEUED" },
    update: {},
  });
}

async function recordOutbound(input: {
  organizationId: string;
  channel: DeliveryChannel;
  userId: string | null;
  taskId?: string | null;
  taskAssignmentId?: string | null;
  body: string;
  messageType?: "TEXT" | "TEMPLATE" | "BUTTON" | "SYSTEM";
  result: ProviderMessageResult | null;
  templateName?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const ok = input.result?.ok === true;
  const externalMessageId = ok && input.result?.ok ? input.result.externalMessageId : null;
  if (externalMessageId) {
    // Edits re-use the provider message id: update the existing outbound row instead of inserting a duplicate.
    const existing = await prisma.communicationMessage.findUnique({ where: { channel_direction_externalMessageId: { channel: input.channel, direction: "OUTBOUND", externalMessageId } } });
    if (existing) {
      return prisma.communicationMessage.update({ where: { id: existing.id }, data: { body: input.body, metadataJson: asJson({ ...(existing.metadataJson as object), ...input.metadata, editedAt: new Date().toISOString() }), sentAt: new Date() } });
    }
  }
  return prisma.communicationMessage.create({
    data: {
      organizationId: input.organizationId,
      channel: input.channel,
      direction: "OUTBOUND",
      messageType: input.messageType ?? "TEXT",
      userId: input.userId,
      taskId: input.taskId ?? null,
      taskAssignmentId: input.taskAssignmentId ?? null,
      body: input.body,
      templateName: input.templateName ?? null,
      externalMessageId,
      status: input.result === null ? "SENT" : ok ? "SENT" : "FAILED",
      sentAt: ok || input.result === null ? new Date() : null,
      failedAt: input.result && !ok ? new Date() : null,
      errorCode: input.result && !input.result.ok ? input.result.errorCode : null,
      errorMessage: input.result && !input.result.ok ? input.result.errorMessage : null,
      metadataJson: asJson(input.metadata),
    },
  });
}

async function buildAssignmentContent(assignmentId: string, organizationId: string): Promise<{ content: AssignmentMessageContent; assignment: NonNullable<Awaited<ReturnType<typeof loadForSend>>> }> {
  const assignment = await loadForSend(assignmentId, organizationId);
  if (!assignment) throw notFound("Assignment");
  const org = assignment.organization;
  const task = assignment.task;
  const content: AssignmentMessageContent = {
    assignmentId: assignment.id,
    taskTitle: task.title,
    projectName: task.project.name,
    clientName: task.project.client?.name ?? null,
    dueLabel: task.dueAt ? describeDue(task.dueAt, org.timezone) : null,
    estimateLabel: formatEstimate(task.estimatedMinutes),
    description: task.description,
    openUrl: `${APP_URL()}/tasks/${task.id}`,
    acceptRef: signRef("acc", assignment.id),
    rejectRef: signRef("rej", assignment.id),
  };
  return { content, assignment };
}

function loadForSend(id: string, organizationId: string) {
  return prisma.taskAssignment.findFirst({ where: { id, organizationId }, include: { task: { include: { project: { include: { client: true } } } }, organization: true, deliveries: true } });
}

/** Attempt delivery with controlled retries. Updates the delivery row after each attempt. */
async function attemptWithRetry(delivery: AssignmentDelivery, retryDelays: number[], send: () => Promise<ProviderMessageResult>): Promise<{ delivery: AssignmentDelivery; result: ProviderMessageResult }> {
  let last: ProviderMessageResult = { ok: false, errorCode: "NO_ATTEMPT", errorMessage: "No attempt made", retryable: false };
  let row = delivery;
  for (let i = 0; i < retryDelays.length; i++) {
    await sleep(retryDelays[i]);
    last = await send();
    const now = new Date();
    if (last.ok) {
      row = await prisma.assignmentDelivery.update({
        where: { id: row.id },
        data: { status: "SENT", externalMessageId: last.externalMessageId, attemptCount: { increment: 1 }, lastAttemptAt: now, sentAt: now, failedAt: null, errorCode: null, errorMessage: null },
      });
      return { delivery: row, result: last };
    }
    row = await prisma.assignmentDelivery.update({
      where: { id: row.id },
      data: { attemptCount: { increment: 1 }, lastAttemptAt: now, errorCode: last.errorCode, errorMessage: last.errorMessage },
    });
    if (!last.retryable) break;
  }
  row = await prisma.assignmentDelivery.update({ where: { id: row.id }, data: { status: "FAILED", failedAt: new Date() } });
  return { delivery: row, result: last };
}

async function failDelivery(delivery: AssignmentDelivery, code: string, message: string) {
  return prisma.assignmentDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", failedAt: new Date(), errorCode: code, errorMessage: message, lastAttemptAt: new Date() } });
}

export const MessagingService = {
  /**
   * Send (or re-send) an assignment through the appropriate channel(s).
   * One task_assignment → N assignment_deliveries (unique per channel) → N communication_messages.
   */
  async sendAssignment(assignmentId: string, options: SendAssignmentOptions = {}): Promise<SendResult> {
    const { content, assignment } = await buildAssignmentContent(assignmentId, (await prisma.taskAssignment.findUniqueOrThrow({ where: { id: assignmentId } })).organizationId);
    const organizationId = assignment.organizationId;
    const sendVia: SendVia = options.sendVia ?? (assignment.preferredChannel === "DEFAULT" ? "PREFERENCE" : assignment.preferredChannel);
    let channels = options.onlyChannels ?? (await resolveChannels(organizationId, assignment.userId, sendVia));
    const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    const results: ChannelSendResult[] = [];
    const org = assignment.organization;

    // Fallback (opt-in): if the preferred channel is not ready, use the other one when enabled.
    if (org.allowChannelFallback && !options.onlyChannels && channels.length === 1 && channels[0] !== "WEB") {
      const primary = channels[0] as "WHATSAPP" | "TELEGRAM";
      const ready = await channelReadiness(organizationId, assignment.userId, primary);
      if (!ready.ready) {
        const alt: "WHATSAPP" | "TELEGRAM" = primary === "WHATSAPP" ? "TELEGRAM" : "WHATSAPP";
        const altReady = await channelReadiness(organizationId, assignment.userId, alt);
        if (altReady.ready) channels = [alt];
      }
    }

    for (const channel of channels) {
      let delivery = await upsertDelivery(organizationId, assignment.id, channel);
      if (delivery.status === "SENT" || delivery.status === "DELIVERED" || delivery.status === "READ") {
        if (!options.onlyChannels) {
          results.push({ channel, status: delivery.status, externalMessageId: delivery.externalMessageId });
          continue; // already sent — never duplicate
        }
      }
      if (channel === "WEB") {
        delivery = await prisma.assignmentDelivery.update({ where: { id: delivery.id }, data: { status: "DELIVERED", sentAt: new Date(), deliveredAt: new Date(), attemptCount: { increment: 1 }, lastAttemptAt: new Date() } });
        await recordOutbound({ organizationId, channel, userId: assignment.userId, taskId: assignment.taskId, taskAssignmentId: assignment.id, body: `Task assigned: ${content.taskTitle}`, messageType: "SYSTEM", result: null });
        results.push({ channel, status: "DELIVERED" });
        continue;
      }
      const readiness = await channelReadiness(organizationId, assignment.userId, channel);
      if (!readiness.ready) {
        delivery = await failDelivery(delivery, readiness.code, readiness.reason);
        await recordOutbound({ organizationId, channel, userId: assignment.userId, taskId: assignment.taskId, taskAssignmentId: assignment.id, body: `Assignment: ${content.taskTitle}`, result: { ok: false, errorCode: readiness.code, errorMessage: readiness.reason, retryable: false } });
        results.push({ channel, status: "FAILED", errorCode: readiness.code, errorMessage: readiness.reason });
        continue;
      }
      const provider = getProvider(channel);
      const recipient = { providerUserId: readiness.identity.providerUserId, chatId: readiness.identity.providerChatId };
      const { delivery: done, result } = await attemptWithRetry(delivery, retryDelays, () => provider.sendTaskAssignment(readiness.conn, recipient, content));
      await recordOutbound({
        organizationId,
        channel,
        userId: assignment.userId,
        taskId: assignment.taskId,
        taskAssignmentId: assignment.id,
        body: channel === "WHATSAPP" ? (await import("@trackwise/messaging")).formatWhatsAppAssignment(content) : (await import("@trackwise/messaging")).formatTelegramAssignment(content),
        messageType: channel === "TELEGRAM" ? "BUTTON" : "TEXT",
        result,
        templateName: channel === "WHATSAPP" && readiness.conn.provider === "WHATSAPP" ? readiness.conn.assignmentTemplateName : null,
        metadata: { attempt: done.attemptCount },
      });
      results.push({ channel, status: done.status, externalMessageId: done.externalMessageId, errorCode: done.errorCode, errorMessage: done.errorMessage });
      if (done.status === "FAILED") {
        const { notifyDeliveryFailed } = await import("../notifications");
        await notifyDeliveryFailed(assignment.id, channel, done.errorMessage ?? "Unknown error");
      }
    }
    return { assignmentId: assignment.id, deliveries: results };
  },

  /** Manager retry of failed deliveries. Re-uses the same assignment and delivery rows. */
  async retry(actor: Actor, assignmentId: string, channel?: DeliveryChannel, retryDelaysMs?: number[]): Promise<SendResult> {
    requirePermission(actor, "messaging:retry");
    const assignment = await prisma.taskAssignment.findFirst({ where: { id: assignmentId, organizationId: actor.organizationId }, include: { deliveries: true } });
    if (!assignment) throw notFound("Assignment");
    if (assignment.status !== "PENDING") throw forbidden("Only pending assignments can be re-sent");
    const failed = assignment.deliveries.filter((d) => d.status === "FAILED" && (!channel || d.channel === channel) && d.channel !== "WEB");
    if (failed.length === 0 && !channel) throw forbidden("Nothing to retry");
    const channels = channel ? [channel] : failed.map((d) => d.channel);
    for (const d of failed) {
      await prisma.assignmentDelivery.update({ where: { id: d.id }, data: { status: "QUEUED", failedAt: null } });
    }
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "message.retry", entityType: "TaskAssignment", entityId: assignment.id, metadata: { channels } });
    return this.sendAssignment(assignmentId, { onlyChannels: channels, actorUserId: actor.userId, retryDelaysMs });
  },

  /** Send a free-form message to a member through a specific channel (used for confirmations and notifications). */
  async sendToUser(input: {
    organizationId: string;
    userId: string;
    channel: "WHATSAPP" | "TELEGRAM";
    text: string;
    buttons?: InlineButton[];
    editMessageId?: string;
    taskId?: string | null;
    taskAssignmentId?: string | null;
    messageType?: "TEXT" | "BUTTON" | "SYSTEM";
    conversationState?: "IDLE" | "AWAITING_REJECTION_REASON" | "AWAITING_ASSIGN_CONFIRMATION" | "AWAITING_ASSIGNEE_CHOICE" | "AWAITING_PROJECT_CHOICE" | "AWAITING_DUE_CLARIFICATION";
  }): Promise<ProviderMessageResult> {
    const readiness = await channelReadiness(input.organizationId, input.userId, input.channel);
    if (!readiness.ready) {
      return { ok: false, errorCode: readiness.code, errorMessage: readiness.reason, retryable: false };
    }
    return this.sendRaw({ ...input, conn: readiness.conn, recipient: { providerUserId: readiness.identity.providerUserId, chatId: readiness.identity.providerChatId } });
  },

  /** Lower-level send when the identity is already resolved (inbound replies). */
  async sendRaw(input: {
    organizationId: string;
    userId: string | null;
    channel: "WHATSAPP" | "TELEGRAM";
    conn: ProviderConnection;
    recipient: { providerUserId: string; chatId?: string | null };
    text: string;
    buttons?: InlineButton[];
    editMessageId?: string;
    taskId?: string | null;
    taskAssignmentId?: string | null;
    messageType?: "TEXT" | "BUTTON" | "SYSTEM";
    conversationState?: "IDLE" | "AWAITING_REJECTION_REASON" | "AWAITING_ASSIGN_CONFIRMATION" | "AWAITING_ASSIGNEE_CHOICE" | "AWAITING_PROJECT_CHOICE" | "AWAITING_DUE_CLARIFICATION";
  }): Promise<ProviderMessageResult> {
    const provider = getProvider(input.channel);
    const msg: OutboundMessage = { text: input.text, buttons: input.buttons, editMessageId: input.editMessageId };
    const result = await provider.sendMessage(input.conn, input.recipient, msg);
    const row = await recordOutbound({
      organizationId: input.organizationId,
      channel: input.channel,
      userId: input.userId,
      taskId: input.taskId,
      taskAssignmentId: input.taskAssignmentId,
      body: input.text,
      messageType: input.messageType ?? (input.buttons?.length ? "BUTTON" : "TEXT"),
      result,
      metadata: { buttons: input.buttons?.map((b) => b.label), edited: !!input.editMessageId },
    });
    if (input.conversationState) await prisma.communicationMessage.update({ where: { id: row.id }, data: { conversationState: input.conversationState } });
    return result;
  },

  /** Apply a provider status callback to the matching delivery/message (monotonic). */
  async applyMessageStatus(channel: "WHATSAPP" | "TELEGRAM", externalMessageId: string, status: "SENT" | "DELIVERED" | "READ" | "FAILED", error?: { code?: string | null; message?: string | null }, at = new Date()) {
    const order: Record<DeliveryStatus, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 9 };
    const delivery = await prisma.assignmentDelivery.findFirst({ where: { channel, externalMessageId } });
    if (delivery) {
      if (status === "FAILED" || order[status] > order[delivery.status]) {
        await prisma.assignmentDelivery.update({
          where: { id: delivery.id },
          data: {
            status,
            ...(status === "DELIVERED" ? { deliveredAt: at } : {}),
            ...(status === "READ" ? { readAt: at, deliveredAt: delivery.deliveredAt ?? at } : {}),
            ...(status === "FAILED" ? { failedAt: at, errorCode: error?.code ?? null, errorMessage: error?.message ?? null } : {}),
          },
        });
        if (status === "FAILED") {
          const { notifyDeliveryFailed } = await import("../notifications");
          await notifyDeliveryFailed(delivery.taskAssignmentId, channel, error?.message ?? "Provider reported failure");
        }
      }
    }
    const msg = await prisma.communicationMessage.findFirst({ where: { channel, direction: "OUTBOUND", externalMessageId } });
    if (msg) {
      const msgOrder: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 9, RECEIVED: 0 };
      if (status === "FAILED" || msgOrder[status] > msgOrder[msg.status]) {
        await prisma.communicationMessage.update({
          where: { id: msg.id },
          data: {
            status,
            ...(status === "DELIVERED" ? { deliveredAt: at } : {}),
            ...(status === "READ" ? { readAt: at } : {}),
            ...(status === "FAILED" ? { failedAt: at, errorCode: error?.code ?? null, errorMessage: error?.message ?? null } : {}),
          },
        });
      }
    }
    return { matchedDelivery: !!delivery, matchedMessage: !!msg };
  },

  /** Unified message/activity timeline for a task. */
  async timeline(actor: Actor, taskId: string, filter: "ALL" | "WHATSAPP" | "TELEGRAM" | "SYSTEM" = "ALL") {
    const { TaskService } = await import("../tasks");
    await TaskService.get(actor, taskId);
    const messages = await prisma.communicationMessage.findMany({ where: { organizationId: actor.organizationId, taskId }, orderBy: { createdAt: "asc" } });
    const assignmentIds = (await prisma.taskAssignment.findMany({ where: { taskId }, select: { id: true } })).map((a) => a.id);
    const audits = await prisma.auditLog.findMany({
      where: { organizationId: actor.organizationId, OR: [{ entityType: "Task", entityId: taskId }, { entityType: "TaskAssignment", entityId: { in: assignmentIds } }, { entityType: { in: ["ActiveTimer", "TimeEntry"] }, metadataJson: { path: ["taskId"], equals: taskId } }] },
      orderBy: { createdAt: "asc" },
    });
    const userIds = new Set<string>();
    for (const m of messages) if (m.userId) userIds.add(m.userId);
    for (const a of audits) if (a.actorUserId) userIds.add(a.actorUserId);
    const users = await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } });
    const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? "System";
    type Item = { at: Date; kind: "WHATSAPP" | "TELEGRAM" | "SYSTEM" | "WEB"; actor: string; title: string; detail?: string | null; status?: string | null; direction?: "INBOUND" | "OUTBOUND" };
    const items: Item[] = [];
    for (const m of messages) {
      const isWeb = m.channel === "WEB";
      const notification = m.messageType === "SYSTEM" && m.direction === "OUTBOUND";
      items.push({
        at: m.createdAt,
        kind: isWeb ? "SYSTEM" : m.channel,
        actor: m.direction === "INBOUND" ? nameOf(m.userId) : notification ? `Notification → ${nameOf(m.userId)}` : "Trackwise",
        title: m.direction === "INBOUND" ? `"${m.body}"` : m.body,
        status: isWeb ? null : m.status,
        direction: m.direction,
        detail: m.errorMessage,
      });
      // Provider delivery receipts (WhatsApp only reports these; web/in-app rows have none).
      if (!isWeb && m.deliveredAt && m.deliveredAt.getTime() - m.createdAt.getTime() > 1000) items.push({ at: m.deliveredAt, kind: m.channel, actor: m.channel === "WHATSAPP" ? "WhatsApp" : "Telegram", title: "Delivered ✓" });
      if (!isWeb && m.readAt) items.push({ at: m.readAt, kind: m.channel, actor: m.channel === "WHATSAPP" ? "WhatsApp" : "Telegram", title: "Read ✓✓" });
    }
    for (const a of audits) {
      const meta = (a.metadataJson ?? {}) as Record<string, unknown>;
      const showReason = a.action === "task.rejected" || a.action === "timesheet.rejected";
      items.push({ at: a.createdAt, kind: "SYSTEM", actor: nameOf(a.actorUserId), title: humanizeAction(a.action, meta), detail: showReason && typeof meta.reason === "string" ? meta.reason : null });
    }
    items.sort((x, y) => x.at.getTime() - y.at.getTime());
    return filter === "ALL" ? items : items.filter((i) => i.kind === filter);
  },
};

function fmtSecs(s: number) {
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function humanizeAction(action: string, meta: Record<string, unknown>) {
  const map: Record<string, string> = {
    "task.created": "Task created",
    "task.assigned": "Task assigned",
    "task.accepted": `Task accepted${meta.via ? ` via ${String(meta.via).toLowerCase()}` : ""}`,
    "task.rejected": `Task rejected${meta.via ? ` via ${String(meta.via).toLowerCase()}` : ""}`,
    "task.completed": "Task completed",
    "task.cancelled": "Task cancelled",
    "timer.started": "Started timer",
    "timer.stopped": `Stopped timer${typeof meta.durationSeconds === "number" ? ` · ${fmtSecs(meta.durationSeconds as number)}` : ""}${meta.reason === "switch" ? " (switched task)" : meta.reason === "task_completed" ? " (task completed)" : ""}`,
    "message.retry": "Retried delivery",
    "assignment.cancelled": "Assignment cancelled",
  };
  return map[action] ?? action;
}
