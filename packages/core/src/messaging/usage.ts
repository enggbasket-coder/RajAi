/** WhatsApp usage per organization per month — what the platform owner re-bills when organizations
 *  share the platform number. A "conversation" follows Meta's rule of thumb: an outbound message to a
 *  recipient with no traffic in either direction during the previous 24 hours opens a new one. */
import { prisma } from "@trackwise/database";

export interface OrgUsage {
  organizationId: string;
  organizationName: string;
  outbound: number;
  delivered: number;
  failed: number;
  inbound: number;
  recipients: number;
  conversations: number;
  estimatedCost: number;
}

export interface UsageReport {
  month: string;
  from: Date;
  to: Date;
  ratePerConversation: number;
  currency: string;
  rows: OrgUsage[];
  totals: Omit<OrgUsage, "organizationId" | "organizationName">;
}

export function monthRange(month: string): { from: Date; to: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error("month must be YYYY-MM");
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  return { from: new Date(Date.UTC(y, mo, 1)), to: new Date(Date.UTC(y, mo + 1, 1)) };
}

export function currentMonth(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function conversationRate(): { rate: number; currency: string } {
  const rate = Number(process.env.WHATSAPP_CONVERSATION_RATE || 0);
  return { rate: Number.isFinite(rate) ? rate : 0, currency: process.env.WHATSAPP_CONVERSATION_CURRENCY || "INR" };
}

export const UsageService = {
  async whatsappMonthly(month: string, opts: { organizationId?: string; rate?: number } = {}): Promise<UsageReport> {
    const { from, to } = monthRange(month);
    const { rate: envRate, currency } = conversationRate();
    const rate = opts.rate ?? envRate;
    const lookback = new Date(from.getTime() - 24 * 60 * 60 * 1000);
    const messages = await prisma.communicationMessage.findMany({
      where: { channel: "WHATSAPP", createdAt: { gte: lookback, lt: to }, ...(opts.organizationId ? { organizationId: opts.organizationId } : {}) },
      select: { organizationId: true, userId: true, direction: true, status: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const orgIds = [...new Set(messages.map((m) => m.organizationId))];
    const orgs = await prisma.organization.findMany({ where: opts.organizationId ? { id: opts.organizationId } : { id: { in: orgIds } }, select: { id: true, name: true } });
    const byOrg = new Map<string, OrgUsage>();
    for (const o of orgs) byOrg.set(o.id, { organizationId: o.id, organizationName: o.name, outbound: 0, delivered: 0, failed: 0, inbound: 0, recipients: 0, conversations: 0, estimatedCost: 0 });
    const lastSeen = new Map<string, number>(); // org:user → last message time
    const recipients = new Map<string, Set<string>>();
    for (const m of messages) {
      const key = `${m.organizationId}:${m.userId ?? "-"}`;
      const inMonth = m.createdAt >= from;
      const row = byOrg.get(m.organizationId);
      if (inMonth && row) {
        if (m.direction === "OUTBOUND") {
          row.outbound += 1;
          if (m.status === "DELIVERED" || m.status === "READ") row.delivered += 1;
          if (m.status === "FAILED") row.failed += 1;
          if (m.userId) (recipients.get(m.organizationId) ?? recipients.set(m.organizationId, new Set()).get(m.organizationId)!).add(m.userId);
          const prev = lastSeen.get(key);
          if (m.status !== "FAILED" && (prev === undefined || m.createdAt.getTime() - prev > 24 * 60 * 60 * 1000)) row.conversations += 1;
        } else {
          row.inbound += 1;
        }
      }
      lastSeen.set(key, m.createdAt.getTime());
    }
    const rows = [...byOrg.values()].map((r) => ({ ...r, recipients: recipients.get(r.organizationId)?.size ?? 0, estimatedCost: Math.round(r.conversations * rate * 100) / 100 })).sort((a, b) => b.conversations - a.conversations || a.organizationName.localeCompare(b.organizationName));
    const totals = rows.reduce((t, r) => ({ outbound: t.outbound + r.outbound, delivered: t.delivered + r.delivered, failed: t.failed + r.failed, inbound: t.inbound + r.inbound, recipients: t.recipients + r.recipients, conversations: t.conversations + r.conversations, estimatedCost: Math.round((t.estimatedCost + r.estimatedCost) * 100) / 100 }), { outbound: 0, delivered: 0, failed: 0, inbound: 0, recipients: 0, conversations: 0, estimatedCost: 0 });
    return { month, from, to, ratePerConversation: rate, currency, rows, totals };
  },

  toCsv(report: UsageReport): string {
    const esc = (v: string | number) => (typeof v === "number" ? String(v) : `"${v.replace(/"/g, '""')}"`);
    const head = ["month", "organization", "outbound", "delivered", "failed", "inbound", "recipients", "conversations", `estimated_cost_${report.currency.toLowerCase()}`];
    const lines = report.rows.map((r) => [report.month, r.organizationName, r.outbound, r.delivered, r.failed, r.inbound, r.recipients, r.conversations, r.estimatedCost].map(esc).join(","));
    return [head.join(","), ...lines, "", `# Prepared with PlusBrains AI · Trackwise · ${new Date().toISOString().slice(0, 10)} · rate ${report.ratePerConversation} ${report.currency} per conversation`].join("\n");
  },
};
