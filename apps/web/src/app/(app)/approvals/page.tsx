import Link from "next/link";
import {TimesheetService} from "@trackwise/core";
import { prisma } from "@trackwise/database";
import { formatDate } from "@trackwise/shared";
import { guard, requireActor } from "@/lib/session";
import { formatDuration } from "@/lib/format";
import { ActionButton } from "@/components/forms";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  guard(actor, "timesheets:approve");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
  const status = (sp.status ?? "SUBMITTED") as "SUBMITTED" | "APPROVED" | "REJECTED" | "DRAFT";
  const sheets = (await TimesheetService.list(actor, { status })).filter((t) => t.entries.length > 0 || status !== "DRAFT");
  return (
    <>
      <PageHeader title="Timesheet approvals" actions={<div className="flex gap-1">{["SUBMITTED", "APPROVED", "REJECTED"].map((s) => <Link key={s} href={`/approvals?status=${s}`} className={`btn-sm ${status === s ? "btn-primary" : "btn-secondary"}`}>{s[0] + s.slice(1).toLowerCase()}</Link>)}</div>} />
      <Card>
        {sheets.length === 0 ? <Empty>No {status.toLowerCase()} timesheets.</Empty> : (
          <table className="table">
            <thead><tr><th>Employee</th><th>Week</th><th>Hours</th><th>Manual entries</th><th>Status</th><th>Submitted</th><th></th></tr></thead>
            <tbody>
              {sheets.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium">{t.userName}{t.userId === actor.userId ? <span className="ml-1 text-xs text-slate-400">(you)</span> : null}</td>
                  <td><Link href={`/timesheets/weekly?date=${t.weekStart.toISOString().slice(0, 10)}&userId=${t.userId}`} className="text-brand-700 hover:underline">{formatDate(t.weekStart, org.timezone)}</Link></td>
                  <td>{formatDuration(t.totalSeconds)}</td>
                  <td>{t.entries.filter((e) => e.manual).length ? <span className="badge bg-amber-100 text-amber-800">{t.entries.filter((e) => e.manual).length} manual</span> : "—"}</td>
                  <td><Badge value={t.status} />{t.reviewComment ? <div className="text-xs text-slate-500">“{t.reviewComment}”</div> : null}</td>
                  <td className="text-slate-600">{t.submittedAt ? formatDate(t.submittedAt, org.timezone) : "—"}</td>
                  <td className="text-right">
                    {t.status === "SUBMITTED" && t.userId !== actor.userId ? (
                      <span className="inline-flex gap-1">
                        <ActionButton action={`/api/timesheets/${t.id}/approve`} className="btn-primary btn-sm">Approve</ActionButton>
                        <ActionButton action={`/api/timesheets/${t.id}/reject`} prompt={{ field: "comment", label: "Rejection comment (sent to the employee):" }} className="btn-secondary btn-sm">Reject</ActionButton>
                      </span>
                    ) : null}
                    {t.status === "SUBMITTED" && t.userId === actor.userId ? <span className="text-xs text-slate-400">Cannot approve your own</span> : null}
                    {t.status === "APPROVED" || t.status === "REJECTED" ? <ActionButton action={`/api/timesheets/${t.id}/reopen`} prompt={{ field: "reason", label: "Reason for reopening (audited):" }} className="btn-secondary btn-sm">Reopen</ActionButton> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
