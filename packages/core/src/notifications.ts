import { prisma } from "@trackwise/database";
import { signRef } from "@trackwise/shared";
import { MessagingService } from "./messaging/service";
import { APP_URL } from "./context";

export type NotificationKey =
  | "task_assigned"
  | "task_accepted"
  | "task_rejected"
  | "delivery_failed"
  | "timer_started"
  | "timer_stopped"
  | "timesheet_submitted"
  | "timesheet_approved"
  | "timesheet_rejected"
  | "task_completed";

/** MVP defaults: the first four are on; the rest are optional organization toggles. */
export const NOTIFICATION_DEFAULTS: Record<NotificationKey, boolean> = {
  task_assigned: true,
  task_accepted: true,
  task_rejected: true,
  delivery_failed: true,
  timer_started: false,
  timer_stopped: false,
  timesheet_submitted: false,
  timesheet_approved: false,
  timesheet_rejected: false,
  task_completed: false,
};

export function notificationEnabled(settings: unknown, key: NotificationKey): boolean {
  const s = (settings ?? {}) as Record<string, boolean>;
  return key in s ? !!s[key] : NOTIFICATION_DEFAULTS[key];
}

/**
 * Notify a member. Uses the organization's default management channel when the member has it connected;
 * otherwise (or for WEB) it is recorded as an in-app system message only. Never spams a second channel.
 */
export async function notifyUser(input: { organizationId: string; userId: string; key: NotificationKey; text: string; taskId?: string | null; taskAssignmentId?: string | null; buttons?: { label: string; url?: string; data?: string }[] }) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: input.organizationId } });
  if (!notificationEnabled(org.notificationSettings, input.key)) return { sent: false, reason: "disabled" };
  const member = await prisma.organizationMember.findFirst({ where: { organizationId: input.organizationId, userId: input.userId, active: true } });
  if (!member) return { sent: false, reason: "not_member" };
  const channel = org.defaultManagementChannel;
  if (channel !== "WEB") {
    const r = await MessagingService.sendToUser({ organizationId: input.organizationId, userId: input.userId, channel, text: input.text, buttons: input.buttons, taskId: input.taskId, taskAssignmentId: input.taskAssignmentId, messageType: "SYSTEM" });
    if (r.ok) return { sent: true, channel };
  }
  await prisma.communicationMessage.create({
    data: { organizationId: input.organizationId, channel: "WEB", direction: "OUTBOUND", messageType: "SYSTEM", userId: input.userId, taskId: input.taskId ?? null, taskAssignmentId: input.taskAssignmentId ?? null, body: input.text, status: "DELIVERED", sentAt: new Date(), deliveredAt: new Date(), metadataJson: { notification: input.key } },
  });
  return { sent: true, channel: "WEB" as const };
}

async function assignmentContext(assignmentId: string) {
  const a = await prisma.taskAssignment.findUnique({ where: { id: assignmentId }, include: { task: { include: { project: true } } } });
  if (!a) return null;
  const employee = await prisma.user.findUnique({ where: { id: a.userId }, select: { name: true } });
  const member = await prisma.organizationMember.findFirst({ where: { organizationId: a.organizationId, userId: a.userId }, select: { displayName: true } });
  return { a, employeeName: member?.displayName || employee?.name || "Employee" };
}

export async function notifyAssignmentAccepted(assignmentId: string) {
  const ctx = await assignmentContext(assignmentId);
  if (!ctx) return;
  const { a, employeeName } = ctx;
  await notifyUser({ organizationId: a.organizationId, userId: a.assignedByUserId, key: "task_accepted", taskId: a.taskId, taskAssignmentId: a.id, text: `✅ ${employeeName} accepted "${a.task.title}" (${a.task.project.name}).`, buttons: [{ label: "Open Task", url: `${APP_URL()}/tasks/${a.taskId}` }] });
}

export async function notifyAssignmentRejected(assignmentId: string) {
  const ctx = await assignmentContext(assignmentId);
  if (!ctx) return;
  const { a, employeeName } = ctx;
  await notifyUser({ organizationId: a.organizationId, userId: a.assignedByUserId, key: "task_rejected", taskId: a.taskId, taskAssignmentId: a.id, text: `❌ ${employeeName} rejected "${a.task.title}".\nReason: ${a.rejectionReason ?? "—"}`, buttons: [{ label: "Reassign", url: `${APP_URL()}/tasks/${a.taskId}` }] });
}

export async function notifyDeliveryFailed(assignmentId: string, channel: string, error: string) {
  const ctx = await assignmentContext(assignmentId);
  if (!ctx) return;
  const { a, employeeName } = ctx;
  await notifyUser({ organizationId: a.organizationId, userId: a.assignedByUserId, key: "delivery_failed", taskId: a.taskId, taskAssignmentId: a.id, text: `⚠️ Could not deliver "${a.task.title}" to ${employeeName} via ${channel === "WHATSAPP" ? "WhatsApp" : "Telegram"}.\n${error}`, buttons: [{ label: "Retry", url: `${APP_URL()}/tasks/${a.taskId}` }] });
}

export async function notifyTaskCompleted(taskId: string, byUserId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { project: true, assignments: true } });
  if (!task) return;
  const by = await prisma.user.findUnique({ where: { id: byUserId }, select: { name: true } });
  const managers = new Set<string>([task.createdByUserId, ...(task.project.managerUserId ? [task.project.managerUserId] : []), ...task.assignments.map((x) => x.assignedByUserId)]);
  managers.delete(byUserId);
  for (const m of managers) await notifyUser({ organizationId: task.organizationId, userId: m, key: "task_completed", taskId, text: `🏁 ${by?.name ?? "Someone"} completed "${task.title}".` });
}

export async function notifyTimesheet(key: "timesheet_submitted" | "timesheet_approved" | "timesheet_rejected", organizationId: string, toUserId: string, text: string) {
  await notifyUser({ organizationId, userId: toUserId, key, text });
}

export { signRef };
