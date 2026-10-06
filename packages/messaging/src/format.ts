import type { AssignmentMessageContent } from "./types";

/** WhatsApp body for a new assignment (reply-based). */
export function formatWhatsAppAssignment(c: AssignmentMessageContent): string {
  const lines = ["New Trackwise Task", `Task: ${c.taskTitle}`, `Project: ${c.projectName}`];
  if (c.dueLabel) lines.push(`Due: ${c.dueLabel}`);
  if (c.estimateLabel) lines.push(`Estimate: ${c.estimateLabel}`);
  if (c.description) lines.push(c.description);
  lines.push("Reply:", "1 — Accept", "2 — Reject");
  return lines.join("\n");
}

/** Telegram body for a new assignment (inline buttons attached separately). */
export function formatTelegramAssignment(c: AssignmentMessageContent): string {
  const lines = ["🆕 New Trackwise Task", c.taskTitle, `Project: ${c.projectName}`];
  if (c.dueLabel) lines.push(`Due: ${c.dueLabel}`);
  if (c.estimateLabel) lines.push(`Estimate: ${c.estimateLabel}`);
  if (c.description) lines.push(c.description);
  return lines.join("\n");
}

export function formatEstimate(minutes: number | null | undefined): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return h === 1 ? "1 hour" : `${h} hours`;
  return `${m} min`;
}

export const WHATSAPP_REPLY_HINT = "Please reply:\n1 — Accept\n2 — Reject";
