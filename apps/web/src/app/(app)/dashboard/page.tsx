import Link from "next/link";
import { isManagerial } from "@trackwise/rbac";
import { redirect } from "next/navigation";
import { DashboardService, TimesheetService, TaskService } from "@trackwise/core";
import { prisma } from "@trackwise/database";
import { requireActor } from "@/lib/session";
import { formatDuration, formatDateTime } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await requireActor();
  if (!isManagerial(actor.role)) redirect("/my-tasks");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
  const [s, awaiting, recent] = await Promise.all([
    DashboardService.summary(actor),
    TimesheetService.list(actor, { status: "SUBMITTED" }),
    TaskService.list(actor),
  ]);
  const failed = await prisma.assignmentDelivery.findMany({ where: { organizationId: actor.organizationId, status: "FAILED" }, include: { taskAssignment: { include: { task: true } } }, orderBy: { failedAt: "desc" }, take: 5 });
  const users = await prisma.user.findMany({ where: { id: { in: failed.map((f) => f.taskAssignment.userId) } }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Dashboard" subtitle={org.name} actions={<Link href="/tasks/new" className="btn-primary">＋ Assign task</Link>} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Tracking now" value={s.trackingNow} tone="ok" icon="clock" />
        <Stat label="Hours today" value={formatDuration(s.hoursTodaySeconds)} icon="hours" />
        <Stat label="Tasks assigned today" value={s.tasksAssignedToday} icon="tasks" />
        <Stat label="Timesheets awaiting approval" value={s.timesheetsAwaiting} tone={s.timesheetsAwaiting ? "warn" : undefined} icon="sheet" />
        <Stat label="Assignments accepted" value={s.assignmentsAccepted} tone="ok" icon="check" />
        <Stat label="Assignments pending" value={s.assignmentsPending} tone={s.assignmentsPending ? "warn" : undefined} icon="pending" />
        <Stat label="Assignments rejected" value={s.assignmentsRejected} tone={s.assignmentsRejected ? "danger" : undefined} icon="reject" />
        <Stat label="Messaging failures" value={s.messagingFailures} tone={s.messagingFailures ? "danger" : "ok"} icon="alert" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Messaging">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="mb-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">WhatsApp</div>
              <dl className="space-y-0.5 text-slate-600">
                <div className="flex justify-between"><dt>Delivered</dt><dd>{s.messaging.whatsapp.delivered}</dd></div>
                <div className="flex justify-between"><dt>Sent</dt><dd>{s.messaging.whatsapp.sent}</dd></div>
                <div className="flex justify-between"><dt>Pending</dt><dd>{s.messaging.whatsapp.pending}</dd></div>
                <div className="flex justify-between"><dt>Failed</dt><dd className={s.messaging.whatsapp.failed ? "text-rose-600 font-medium" : ""}>{s.messaging.whatsapp.failed}</dd></div>
              </dl>
            </div>
            <div>
              <div className="mb-2 inline-flex rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">Telegram</div>
              <dl className="space-y-0.5 text-slate-600">
                <div className="flex justify-between"><dt>Delivered/Sent</dt><dd>{s.messaging.telegram.delivered}</dd></div>
                <div className="flex justify-between"><dt>Pending</dt><dd>{s.messaging.telegram.pending}</dd></div>
                <div className="flex justify-between"><dt>Failed</dt><dd className={s.messaging.telegram.failed ? "text-rose-600 font-medium" : ""}>{s.messaging.telegram.failed}</dd></div>
              </dl>
            </div>
          </div>
          {failed.length ? (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-1 text-xs font-semibold uppercase text-rose-600">Recent failures</div>
              <ul className="space-y-1 text-sm">
                {failed.map((f) => (
                  <li key={f.id}>
                    <Link href={`/tasks/${f.taskAssignment.taskId}`} className="text-brand-600 hover:underline">{f.taskAssignment.task.title}</Link>
                    <span className="text-slate-500"> · {users.find((u) => u.id === f.taskAssignment.userId)?.name} · {f.channel} · {f.errorMessage}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
        <Card title="Awaiting approval" actions={<Link href="/approvals" className="text-xs text-brand-600 hover:underline">All approvals</Link>}>
          {awaiting.length === 0 ? <Empty>No submitted timesheets.</Empty> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {awaiting.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <span>{t.userName}<span className="text-slate-400"> · week of {t.weekStart.toISOString().slice(0, 10)}</span></span>
                  <span className="font-medium">{formatDuration(t.totalSeconds)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent tasks" actions={<Link href="/tasks" className="text-xs text-brand-600 hover:underline">All tasks</Link>}>
          {recent.length === 0 ? <Empty>No tasks yet.</Empty> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {recent.slice(0, 6).map((t) => (
                <li key={t.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/tasks/${t.id}`} className="truncate font-medium text-slate-900 hover:text-brand-600">{t.title}</Link>
                    <Badge value={t.status} />
                  </div>
                  <div className="text-xs text-slate-500">{t.project.name} · {formatDateTime(t.createdAt, org.timezone)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
