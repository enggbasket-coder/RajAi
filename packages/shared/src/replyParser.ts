export type ReplyIntent = "ACCEPT" | "REJECT" | "YES" | "NO" | "CHOICE" | "UNKNOWN";

const ACCEPT = new Set(["1", "accept", "accepted", "yes", "y", "ok", "okay", "✅"]);
const REJECT = new Set(["2", "reject", "rejected", "no", "n", "decline", "❌"]);

export function normalizeReply(text: string): string {
  return (text || "").trim().toLowerCase().replace(/[.!]+$/g, "").replace(/\s+/g, " ");
}

/** Parse an employee's assignment reply. Deterministic. */
export function parseAssignmentReply(text: string): "ACCEPT" | "REJECT" | "UNKNOWN" {
  const t = normalizeReply(text);
  if (ACCEPT.has(t)) return "ACCEPT";
  if (REJECT.has(t)) return "REJECT";
  return "UNKNOWN";
}

/** Parse a manager's confirmation reply. */
export function parseConfirmationReply(text: string): "YES" | "NO" | "UNKNOWN" {
  const t = normalizeReply(text);
  if (["yes", "y", "confirm", "ok", "okay", "create", "✅"].includes(t)) return "YES";
  if (["no", "n", "cancel", "stop", "❌"].includes(t)) return "NO";
  return "UNKNOWN";
}

/** Parse a numeric choice from a disambiguation prompt. */
export function parseChoice(text: string, max: number): number | null {
  const t = normalizeReply(text);
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  if (n < 1 || n > max) return null;
  return n;
}
