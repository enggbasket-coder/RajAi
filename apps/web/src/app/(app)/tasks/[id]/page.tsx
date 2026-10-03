import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberService, MessagingService, TaskService, TimerService } from "@trackwise/core";
import { isManagerial } from "@trackwise/rbac";
import { prisma } from "@trackwise/database";
import { requireActor } from "@/lib/session";
import { formatDateTime, formatDuration } from "@/lib/format";
import { ActionButton } from "@/components/forms";
import { Badge, Card, Empty, PageHeader, Tabs } from "@/components/ui";
import { AssignMoreForm, RespondButtons } from "./TaskActions";

export const dynamic = "force-dynamic";

export default async function TaskDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; filter?: string }> }) {
  const { id } = await params;
  const { tab = "overview", filter = "ALL" } = await searchParams;
  const actor = await requireActor();
  let task;
  try {
    task = await TaskService.get(actor, id);
  } catch {
    notFound();
  }
  const managerial = isManagerial(actor.role);
  const [members, org, entries, timeline] = await Promise.all([
    MemberService.list(actor, { includeInactive: true }),
    prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
    managerial ? TimerService.listEntries(actor, {}).then((e) => e.filter((x) => x.taskId === id)) : TimerService.listEntries(actor, {}).then((e) => e.filter((x) => x.taskId === id)),
    tab === "messages" || tab === "activity" ? MessagingService.timeline(actor, id, tab === "activity" ? "SYSTEM" : (filter as never)) : Promise.resolve([]),
  ]);
  const name = (uid: string) => members.find((m) => m.userId === uid)?.name ?? "?";
  const actual = entries.reduce((s, e) => s + e.durationSeconds, 0);
  const live = task.assignments.filter((a) => a.status !== "CANCELLED");
  const mine = task.assignments.find((a) => a.userId === actor.userId);
  const perUser = new Map<string, number>();
  for (const e of entries) perUser.set(e.userId, (perUser.get(e.userId) ?? 0) + e.durationSeconds);
  const tz = org.timezone;
  const tabs = [
    { key: "overview", label: "Overview", href: `/tasks/${id}` },
    { key: "time", label: `Time (${entries.length})`, href: `/tasks/${id}?tab=time` },
    { key: "messages", label: "Messages", href: `/tasks/${id}?tab=messages` },
    { key: "activity", label: "Activity", href: `/tasks/${id}?tab=activity` },
  ];

  return (
    <>
      <PageHeader
        title={task.title}
        subtitle={<><Link href={`/projects/${task.projectId}`} className="hover:underline">{task.project.name}</Link>{task.project.client ? <> · {task.project.client.name}</> : null}</>}
        actions={<>
          {mine?.status === "ACCEPTED" && task.status !== "COMPLETED" ? <Link href={`/timer?task=${task.id}`} className="btn-primary btn-sm">▶ Start timer</Link> : null}
          {task.status !== "COMPLETED" && task.status !== "CANCELLED" && (managerial || mine?.status === "ACCEPTED") ? <ActionButton action={`/api/tasks/${task.id}/complete`} className="btn-secondary btn-sm" confirm="Mark this task complete? Any running timer on it will be stopped.">Mark complete</ActionButton> : null}
          {managerial && task.status !== "COMPLETED" && task.status !== "CANCELLED" ? <ActionButton action={`/api/tasks/${task.id}`} method="PATCH" body={{ status: "CANCELLED" }} className="btn-danger btn-sm" confirm="Cancel this task?">Cancel task</ActionButton> : null}
        </>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 text-sm md:grid-cols-6">
        <div className="card p-3"><div className="stat-label">Status</div><Badge value={task.status} /></div>
        <div className="card p-3"><div className="stat-label">Priority</div><Badge value={task.priority} /></div>
        <div className="card p-3"><div className="stat-label">Due</div>{task.dueAt ? formatDateTime(task.dueAt, tz) : "—"}</div>
        <div className="card p-3"><div className="stat-label">Estimate</div>{task.estimatedMinutes ? formatDuration(task.estimatedMinutes * 60) : "—"}</div>
        <div className="card p-3"><div className="stat-label">Actual</div>{formatDuration(actual)}</div>
        <div className="card p-3"><div className="stat-label">Billable</div>{task.billable ? "Yes" : "No"}</div>
      </div>
      <Tabs tabs={tabs} active={tab} />

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card title="Assignees">
              {live.length === 0 ? <Empty>Not assigned yet.</Empty> : (
                <table className="table">
                  <thead><tr><th>Employee</th><th>Assignment</th><th>Channel · Delivery</th><th>Response</th><th>Hours</th><th></th></tr></thead>
                  <tbody>
                    {live.map((a) => (
                      <tr key={a.id}>
                        <td className="font-medium">{name(a.userId)}</td>
                        <td><Badge value={a.status} /></td>
                        <td>
                          {a.deliveries.length === 0 ? <span className="text-slate-400">—</span> : a.deliveries.map((d) => (
                            <div key={d.id} className="mb-1 flex flex-wrap items-center gap-1 text-xs">
                              <Badge value={d.channel} /><Badge value={d.status} />
                              {d.status === "FAILED" ? <span className="text-rose-600" title={d.errorCode ?? ""}>{d.errorMessage}</span> : null}
                              {d.status === "FAILED" && managerial && a.status === "PENDING" && d.channel !== "WEB" ? <ActionButton action={`/api/assignments/${a.id}/retry`} body={{ channel: d.channel }} className="btn-secondary btn-sm">Retry</ActionButton> : null}
                            </div>
                          ))}
                        </td>
                        <td className="text-slate-600">
                          {a.respondedAt ? <div className="text-xs">{formatDateTime(a.respondedAt, tz)}</div> : <span className="text-slate-400">—</span>}
                          {a.rejectionReason ? <div className="text-xs text-rose-700">“{a.rejectionReason}”</div> : null}
                        </td>
                        <td>{formatDuration(perUser.get(a.userId) ?? 0)}</td>
                        <td className="text-right">
                          {a.userId === actor.userId && a.status === "PENDING" ? <RespondButtons assignmentId={a.id} /> : null}
                          {managerial && a.status === "PENDING" ? <ActionButton action={`/api/assignments/${a.id}/cancel`} className="btn-secondary btn-sm" confirm="Cancel this assignment?">Unassign</ActionButton> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            {task.description ? <Card title="Description"><p className="whitespace-pre-wrap text-sm text-slate-700">{task.description}</p></Card> : null}
          </div>
          <div className="space-y-6">
            {managerial && task.status !== "COMPLETED" && task.status !== "CANCELLED" ? (
              <Card title="Assign more people">
                <AssignMoreForm taskId={task.id} members={members.filter((m) => m.active && !live.some((a) => a.userId === m.userId)).map((m) => ({ userId: m.userId, name: m.name, wa: m.channels.whatsapp.ready, tg: m.channels.telegram.ready }))} />
              </Card>
            ) : null}
            <Card title="Details">
              <dl className="space-y-1 text-sm text-slate-600">
                <div className="flex justify-between"><dt>Created</dt><dd>{formatDateTime(task.createdAt, tz)}</dd></div>
                <div className="flex justify-between"><dt>Created by</dt><dd>{name(task.createdByUserId)}</dd></div>
                {task.completedAt ? <div className="flex justify-between"><dt>Completed</dt><dd>{formatDateTime(task.completedAt, tz)} by {task.completedByUserId ? name(task.completedByUserId) : "—"}</dd></div> : null}
              </dl>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "time" ? (
        <Card title="Time entries">
          {entries.length === 0 ? <Empty>No time tracked on this task yet.</Empty> : (
            <table className="table">
              <thead><tr><th>Employee</th><th>Started</th><th>Stopped</th><th>Duration</th><th>Source</th><th>Status</th></tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{name(e.userId)}</td>
                    <td>{formatDateTime(e.startedAt, tz)}</td>
                    <td>{formatDateTime(e.stoppedAt, tz)}</td>
                    <td>{formatDuration(e.durationSeconds)}</td>
                    <td>{e.manual ? <span className="badge bg-amber-100 text-amber-800" title={e.manualReason ?? ""}>Manual</span> : e.source}</td>
                    <td><Badge value={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}

      {tab === "messages" || tab === "activity" ? (
        <Card title={tab === "messages" ? "Message log" : "Activity"} actions={tab === "messages" ? (
          <div className="flex gap-1 text-xs">
            {["ALL", "WHATSAPP", "TELEGRAM", "SYSTEM"].map((f) => <Link key={f} href={`/tasks/${id}?tab=messages&filter=${f}`} className={`rounded px-2 py-1 ${filter === f ? "bg-brand-100 text-brand-800" : "text-slate-500 hover:bg-slate-100"}`}>{f === "ALL" ? "All" : f === "SYSTEM" ? "System" : f[0] + f.slice(1).toLowerCase()}</Link>)}
          </div>
        ) : null}>
          {timeline.length === 0 ? <Empty>Nothing here yet.</Empty> : (
            <ol className="relative ml-2 border-l border-slate-200">
              {timeline.map((i, idx) => (
                <li key={idx} className="mb-4 ml-4">
                  <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white ${i.kind === "WHATSAPP" ? "bg-green-500" : i.kind === "TELEGRAM" ? "bg-sky-500" : "bg-slate-400"}`} />
                  <div className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="font-mono text-xs text-slate-400">{formatDateTime(i.at, tz)}</span>
                    <Badge value={i.kind === "WEB" ? "SYSTEM" : i.kind} />
                    <span className="text-slate-500">{i.actor}</span>
                    {i.status ? <Badge value={i.status} /> : null}
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{i.title}</div>
                  {i.detail ? <div className="text-xs text-rose-700">{i.detail}</div> : null}
                </li>
              ))}
            </ol>
          )}
        </Card>
      ) : null}
    </>
  );
}
