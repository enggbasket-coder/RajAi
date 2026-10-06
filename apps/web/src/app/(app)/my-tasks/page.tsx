import Link from "next/link";
import { AssignmentService, TimerService } from "@trackwise/core";
import { prisma } from "@trackwise/database";
import { requireActor } from "@/lib/session";
import { formatDateTime, formatDuration } from "@/lib/format";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { RespondButtons } from "../tasks/[id]/TaskActions";
import { ActionButton } from "@/components/forms";

export const dynamic = "force-dynamic";

export default async function MyTasksPage() {
  const actor = await requireActor();
  const [assignments, org, timer] = await Promise.all([AssignmentService.listForUser(actor.organizationId, actor.userId), prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } }), TimerService.current(actor)]);
  const pending = assignments.filter((a) => a.status === "PENDING");
  const accepted = assignments.filter((a) => a.status === "ACCEPTED" && a.task.status !== "COMPLETED");
  const done = assignments.filter((a) => a.status === "REJECTED" || a.task.status === "COMPLETED");
  const row = (a: (typeof assignments)[number], actions: React.ReactNode) => (
    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <Link href={`/tasks/${a.taskId}`} className="font-medium text-slate-800 hover:text-brand-700">{a.task.title}</Link>
        <div className="text-xs text-slate-500">
          {a.task.project.name}{a.task.project.client ? ` · ${a.task.project.client.name}` : ""}
          {a.task.dueAt ? ` · due ${formatDateTime(a.task.dueAt, org.timezone)}` : ""}
          {a.task.estimatedMinutes ? ` · est. ${formatDuration(a.task.estimatedMinutes * 60)}` : ""}
          {" · via "}{a.deliveries.map((d) => d.channel.toLowerCase()).join(" + ") || "web"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge value={a.task.priority} />
        {actions}
      </div>
    </li>
  );
  return (
    <>
      <PageHeader title="My Tasks" subtitle={timer ? <>Tracking <strong>{timer.task.title}</strong> · {formatDuration(timer.elapsedSeconds)}</> : "No timer running"} actions={<Link href="/timer" className="btn-secondary">Open timer</Link>} />
      <div className="space-y-6">
        <Card title={`Pending acceptance (${pending.length})`}>
          {pending.length === 0 ? <Empty>No new assignments. New tasks arrive here and on WhatsApp/Telegram.</Empty> : <ul className="divide-y divide-slate-100">{pending.map((a) => row(a, <RespondButtons assignmentId={a.id} />))}</ul>}
        </Card>
        <Card title={`Accepted (${accepted.length})`}>
          {accepted.length === 0 ? <Empty>Nothing accepted yet.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {accepted.map((a) =>
                row(
                  a,
                  timer?.taskId === a.taskId ? (
                    <ActionButton action="/api/timer/stop" className="btn-danger btn-sm">■ Stop</ActionButton>
                  ) : (
                    <ActionButton action="/api/timer/start" body={{ taskId: a.taskId }} className="btn-primary btn-sm">▶ {timer ? "Switch" : "Start"}</ActionButton>
                  ),
                ),
              )}
            </ul>
          )}
        </Card>
        {done.length ? <Card title="Closed"><ul className="divide-y divide-slate-100">{done.map((a) => row(a, <Badge value={a.status === "REJECTED" ? "REJECTED" : a.task.status} />))}</ul></Card> : null}
      </div>
    </>
  );
}
