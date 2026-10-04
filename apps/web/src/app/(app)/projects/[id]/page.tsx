import Link from "next/link";
import { ClientService, MemberService, ProjectService } from "@trackwise/core";
import { hasPermission } from "@trackwise/rbac";
import { prisma } from "@trackwise/database";
import { requireActor } from "@/lib/session";
import { formatDuration, formatDate } from "@/lib/format";
import { ActionButton, JsonForm } from "@/components/forms";
import { Badge, Card, Empty, Field, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const [project, clients, members, org] = await Promise.all([ProjectService.get(actor, id), ClientService.list(actor), MemberService.list(actor), prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } })]);
  const canWrite = hasPermission(actor.role, "projects:write");
  const budget = project.budgetHours ? Number(project.budgetHours) : null;
  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={<>{project.client ? <Link href={`/clients/${project.client.id}`} className="hover:underline">{project.client.name}</Link> : "No client"} · <Badge value={project.status} /></>}
        actions={<>
          <Link href={`/tasks/new?projectId=${project.id}`} className="btn-primary btn-sm">＋ Assign task</Link>
          {canWrite ? <ActionButton action={`/api/projects/${project.id}/archive`} body={{ archived: !project.archived }} className="btn-secondary btn-sm" confirm={project.archived ? undefined : "Archive this project?"}>{project.archived ? "Unarchive" : "Archive"}</ActionButton> : null}
        </>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Tracked" value={formatDuration(project.trackedSeconds)} hint={budget ? `of ${budget}h budget (${Math.round((project.trackedSeconds / 3600 / budget) * 100)}%)` : "no budget"} />
        <Stat label="Tasks" value={project.tasks.length} />
        <Stat label="Billable" value={project.billable ? "Yes" : "No"} hint={project.hourlyRate ? `${Number(project.hourlyRate)}/h` : undefined} />
        <Stat label="Due" value={project.dueDate ? formatDate(project.dueDate, org.timezone) : "—"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Tasks">
            {project.tasks.length === 0 ? <Empty>No tasks in this project.</Empty> : (
              <table className="table">
                <thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Assignees</th></tr></thead>
                <tbody>
                  {project.tasks.map((t) => (
                    <tr key={t.id}>
                      <td><Link href={`/tasks/${t.id}`} className="font-medium text-slate-900 hover:text-brand-600">{t.title}</Link></td>
                      <td><Badge value={t.status} /></td>
                      <td><Badge value={t.priority} /></td>
                      <td className="text-slate-600">{t.assignments.filter((a) => a.status !== "CANCELLED").map((a) => members.find((m) => m.userId === a.userId)?.name ?? "?").join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
        {canWrite ? (
          <Card title="Edit project">
            <JsonForm action={`/api/projects/${project.id}`} method="PATCH" submitLabel="Save" className="space-y-3" successMessage="Saved">
              <Field label="Name"><input name="name" className="input" defaultValue={project.name} required /></Field>
              <Field label="Client"><select name="clientId" className="input" defaultValue={project.clientId ?? ""}><option value="">No client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label="Code"><input name="code" className="input" defaultValue={project.code ?? ""} /></Field>
              <Field label="Manager"><select name="managerUserId" className="input" defaultValue={project.managerUserId ?? ""}>{members.filter((m) => m.role !== "EMPLOYEE").map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></Field>
              <Field label="Status"><select name="status" className="input" defaultValue={project.status}>{["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"].map((s) => <option key={s}>{s}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Budget hours"><input name="budgetHours" type="number" step="0.5" className="input" defaultValue={budget ?? ""} /></Field>
                <Field label="Hourly rate"><input name="hourlyRate" type="number" step="0.01" className="input" defaultValue={project.hourlyRate ? Number(project.hourlyRate) : ""} /></Field>
              </div>
              <Field label="Description"><textarea name="description" className="input" rows={2} defaultValue={project.description ?? ""} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="billable" defaultChecked={project.billable} /> Billable</label>
            </JsonForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
