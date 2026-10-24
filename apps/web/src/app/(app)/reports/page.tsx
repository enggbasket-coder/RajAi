import { ClientService, MemberService, ProjectService, ReportService } from "@trackwise/core";
import { isManagerial } from "@trackwise/rbac";
import { addDays, startOfWeekInTz, localDateKey, parseDateKey, zonedToUtc } from "@trackwise/shared";
import { prisma } from "@trackwise/database";
import { requireActor } from "@/lib/session";
import { formatDuration } from "@/lib/format";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
  const managerial = isManagerial(actor.role);
  const defaultFrom = localDateKey(startOfWeekInTz(addDays(new Date(), -28), org.timezone), org.timezone);
  const defaultTo = localDateKey(addDays(new Date(), 1), org.timezone);
  const fromKey = sp.from || defaultFrom;
  const toKey = sp.to || defaultTo;
  const f = parseDateKey(fromKey)!;
  const t = parseDateKey(toKey)!;
  const filter = { from: zonedToUtc(org.timezone, f.year, f.month, f.day), to: zonedToUtc(org.timezone, t.year, t.month, t.day), userId: sp.userId || undefined, projectId: sp.projectId || undefined, clientId: sp.clientId || undefined, status: (sp.status as never) || undefined };
  const [report, members, projects, clients] = await Promise.all([ReportService.hours(actor, filter), managerial ? MemberService.list(actor) : [], ProjectService.list(actor), ClientService.list(actor)]);
  const qs = new URLSearchParams({ from: filter.from.toISOString(), to: filter.to.toISOString(), ...(sp.userId ? { userId: sp.userId } : {}), ...(sp.projectId ? { projectId: sp.projectId } : {}), ...(sp.clientId ? { clientId: sp.clientId } : {}), ...(sp.status ? { status: sp.status } : {}) });
  const Table = ({ title, rows }: { title: string; rows: { key: string; label: string; seconds: number; billableSeconds: number; entries: number }[] }) => (
    <Card title={title}>
      {rows.length === 0 ? <Empty>No data.</Empty> : (
        <table className="table">
          <thead><tr><th>{title.replace("Hours by ", "")}</th><th>Hours</th><th>Billable</th><th>Entries</th><th>Share</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="font-medium">{r.label}</td>
                <td>{formatDuration(r.seconds)}</td>
                <td>{formatDuration(r.billableSeconds)}</td>
                <td>{r.entries}</td>
                <td><div className="h-2 w-32 rounded bg-slate-100"><div className="h-2 rounded bg-brand-500" style={{ width: `${report.totalSeconds ? Math.round((r.seconds / report.totalSeconds) * 100) : 0}%` }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
  return (
    <>
      <PageHeader title="Reports" subtitle={managerial ? "Hours by employee, project, client and billability." : "Your hours."} actions={<a href={`/api/reports/export.csv?${qs}`} className="btn-primary">⬇ Export CSV</a>} />
      <form method="GET" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs"><span className="label">From</span><input type="date" name="from" className="input" defaultValue={fromKey} /></label>
        <label className="text-xs"><span className="label">To (exclusive)</span><input type="date" name="to" className="input" defaultValue={toKey} /></label>
        {managerial ? <label className="text-xs"><span className="label">Employee</span><select name="userId" className="input" defaultValue={sp.userId ?? ""}><option value="">All</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label> : null}
        <label className="text-xs"><span className="label">Project</span><select name="projectId" className="input" defaultValue={sp.projectId ?? ""}><option value="">All</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="text-xs"><span className="label">Client</span><select name="clientId" className="input" defaultValue={sp.clientId ?? ""}><option value="">All</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="text-xs"><span className="label">Status</span><select name="status" className="input" defaultValue={sp.status ?? ""}><option value="">All</option>{["RECORDED", "SUBMITTED", "APPROVED", "REJECTED"].map((s) => <option key={s}>{s}</option>)}</select></label>
        <button className="btn-secondary">Apply</button>
      </form>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total" value={formatDuration(report.totalSeconds)} hint={`${report.entryCount} entries`} icon="hours" />
        <Stat label="Billable" value={formatDuration(report.billableSeconds)} tone="ok" icon="bill" />
        <Stat label="Non-billable" value={formatDuration(report.nonBillableSeconds)} icon="tasks" />
        <Stat label="Billable share" value={`${report.totalSeconds ? Math.round((report.billableSeconds / report.totalSeconds) * 100) : 0}%`} icon="percent" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {managerial ? <Table title="Hours by employee" rows={report.byEmployee} /> : null}
        <Table title="Hours by project" rows={report.byProject} />
        <Table title="Hours by client" rows={report.byClient} />
        <Table title="Billable vs non-billable" rows={report.byBillable} />
      </div>
    </>
  );
}
