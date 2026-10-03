import Link from "next/link";
import { MemberService, ProjectService, TaskService } from "@trackwise/core";
import { prisma } from "@trackwise/database";
import { requireActor } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const STATUSES = ["DRAFT", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ status?: string; projectId?: string; assigneeUserId?: string }> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const [tasks, projects, members, org] = await Promise.all([
    TaskService.list(actor, { status: sp.status as never, projectId: sp.projectId, assigneeUserId: sp.assigneeUserId }),
    ProjectService.list(actor),
    MemberService.list(actor),
    prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
  ]);
  const name = (id: string) => members.find((m) => m.userId === id)?.name ?? "?";
  return (
    <>
      <PageHeader title="Tasks" actions={<Link href="/tasks/new" className="btn-primary">＋ New assignment</Link>} />
      <form className="mb-4 flex flex-wrap gap-2" method="GET">
        <select name="status" className="input w-auto" defaultValue={sp.status ?? ""}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select name="projectId" className="input w-auto" defaultValue={sp.projectId ?? ""}><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select name="assigneeUserId" className="input w-auto" defaultValue={sp.assigneeUserId ?? ""}><option value="">Any assignee</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select>
        <button className="btn-secondary">Filter</button>
      </form>
      <Card>
        {tasks.length === 0 ? <Empty>No tasks match.</Empty> : (
          <table className="table">
            <thead><tr><th>Task</th><th>Project</th><th>Assignees</th><th>Status</th><th>Priority</th><th>Due</th><th>Delivery</th></tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/tasks/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.title}</Link></td>
                  <td className="text-slate-600">{t.project.name}</td>
                  <td className="text-slate-600">
                    {t.assignments.filter((a) => a.status !== "CANCELLED").map((a) => (
                      <div key={a.id} className="flex items-center gap-1">{name(a.userId)} <Badge value={a.status} /></div>
                    ))}
                  </td>
                  <td><Badge value={t.status} /></td>
                  <td><Badge value={t.priority} /></td>
                  <td className="text-slate-600">{t.dueAt ? formatDateTime(t.dueAt, org.timezone) : "—"}</td>
                  <td>
                    {t.assignments.flatMap((a) => a.deliveries).map((d) => (
                      <span key={d.id} className="mr-1 inline-flex items-center gap-1 text-xs"><Badge value={d.channel} /><Badge value={d.status} /></span>
                    ))}
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
