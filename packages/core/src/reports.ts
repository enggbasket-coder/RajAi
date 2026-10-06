import { prisma, type TimeEntryStatus } from "@trackwise/database";
import { formatDuration, localDateKey } from "@trackwise/shared";
import { isManagerial } from "@trackwise/rbac";
import { requirePermission, type Actor } from "./context";

export interface ReportFilter {
  from?: Date;
  to?: Date;
  userId?: string;
  projectId?: string;
  clientId?: string;
  status?: TimeEntryStatus;
}

export interface ReportRow {
  key: string;
  label: string;
  seconds: number;
  billableSeconds: number;
  entries: number;
}

async function loadEntries(actor: Actor, f: ReportFilter) {
  const team = isManagerial(actor.role);
  requirePermission(actor, team ? "reports:team" : "reports:own");
  return prisma.timeEntry.findMany({
    where: {
      organizationId: actor.organizationId,
      userId: team ? f.userId : actor.userId,
      ...(f.projectId ? { projectId: f.projectId } : {}),
      ...(f.clientId ? { project: { clientId: f.clientId } } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.from || f.to ? { startedAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
    },
    include: { project: { include: { client: true } }, task: true },
    orderBy: { startedAt: "asc" },
  });
}

function group(entries: Awaited<ReturnType<typeof loadEntries>>, keyOf: (e: (typeof entries)[number]) => { key: string; label: string }): ReportRow[] {
  const map = new Map<string, ReportRow>();
  for (const e of entries) {
    const { key, label } = keyOf(e);
    const row = map.get(key) ?? { key, label, seconds: 0, billableSeconds: 0, entries: 0 };
    row.seconds += e.durationSeconds;
    if (e.billable) row.billableSeconds += e.durationSeconds;
    row.entries += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.seconds - a.seconds);
}

export const ReportService = {
  async hours(actor: Actor, filter: ReportFilter) {
    const entries = await loadEntries(actor, filter);
    const userIds = [...new Set(entries.map((e) => e.userId))];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "—";
    const total = entries.reduce((s, e) => s + e.durationSeconds, 0);
    const billable = entries.filter((e) => e.billable).reduce((s, e) => s + e.durationSeconds, 0);
    return {
      totalSeconds: total,
      billableSeconds: billable,
      nonBillableSeconds: total - billable,
      byEmployee: group(entries, (e) => ({ key: e.userId, label: nameOf(e.userId) })),
      byProject: group(entries, (e) => ({ key: e.projectId, label: e.project.name })),
      byClient: group(entries, (e) => ({ key: e.project.clientId ?? "none", label: e.project.client?.name ?? "No client" })),
      byBillable: group(entries, (e) => ({ key: e.billable ? "billable" : "non-billable", label: e.billable ? "Billable" : "Non-billable" })),
      entryCount: entries.length,
    };
  },

  async exportCsv(actor: Actor, filter: ReportFilter) {
    const entries = await loadEntries(actor, filter);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.userId))] } }, select: { id: true, name: true, email: true } });
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Date", "Employee", "Email", "Client", "Project", "Task", "Started (UTC)", "Stopped (UTC)", "Duration", "Hours", "Billable", "Manual", "Manual reason", "Source", "Status"];
    const lines = [header.join(",")];
    for (const e of entries) {
      const u = users.find((x) => x.id === e.userId);
      lines.push(
        [
          localDateKey(e.startedAt, org.timezone),
          u?.name,
          u?.email,
          e.project.client?.name ?? "",
          e.project.name,
          e.task?.title ?? "",
          e.startedAt.toISOString(),
          e.stoppedAt.toISOString(),
          formatDuration(e.durationSeconds),
          (e.durationSeconds / 3600).toFixed(2),
          e.billable ? "yes" : "no",
          e.manual ? "yes" : "no",
          e.manualReason ?? "",
          e.source,
          e.status,
        ]
          .map(esc)
          .join(","),
      );
    }
    return lines.join("\n") + "\n";
  },
};
