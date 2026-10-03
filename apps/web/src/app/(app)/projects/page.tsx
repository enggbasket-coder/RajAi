import Link from "next/link";
import { ClientService, MemberService, ProjectService } from "@trackwise/core";
import { hasPermission } from "@trackwise/rbac";
import { requireActor } from "@/lib/session";
import { JsonForm } from "@/components/forms";
import { Badge, Card, Empty, Field, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ clientId?: string; all?: string }> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const [projects, clients, members] = await Promise.all([ProjectService.list(actor, { includeArchived: sp.all === "1" }), ClientService.list(actor), MemberService.list(actor)]);
  const canWrite = hasPermission(actor.role, "projects:write");
  return (
    <>
      <PageHeader title="Projects" actions={<Link href={sp.all === "1" ? "/projects" : "/projects?all=1"} className="btn-secondary btn-sm">{sp.all === "1" ? "Hide archived" : "Show archived"}</Link>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            {projects.length === 0 ? <Empty>No projects yet.</Empty> : (
              <table className="table">
                <thead><tr><th>Project</th><th>Client</th><th>Status</th><th>Tasks</th><th>Billable</th></tr></thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td><Link href={`/projects/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.name}</Link>{p.code ? <span className="ml-1 text-xs text-slate-400">{p.code}</span> : null}</td>
                      <td className="text-slate-600">{p.client?.name ?? "—"}</td>
                      <td><Badge value={p.status} /></td>
                      <td>{p._count.tasks}</td>
                      <td>{p.billable ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
        {canWrite ? (
          <Card title="New project">
            <JsonForm action="/api/projects" submitLabel="Create project" className="space-y-3">
              <Field label="Name"><input name="name" className="input" required /></Field>
              <Field label="Client">
                <select name="clientId" className="input" defaultValue={sp.clientId ?? ""}>
                  <option value="">No client</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Code"><input name="code" className="input" /></Field>
              <Field label="Manager">
                <select name="managerUserId" className="input" defaultValue={actor.userId}>
                  {members.filter((m) => m.role !== "EMPLOYEE").map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Budget hours"><input name="budgetHours" type="number" step="0.5" className="input" /></Field>
                <Field label="Hourly rate"><input name="hourlyRate" type="number" step="0.01" className="input" /></Field>
                <Field label="Start"><input name="startDate" type="date" className="input" /></Field>
                <Field label="Due"><input name="dueDate" type="date" className="input" /></Field>
              </div>
              <Field label="Description"><textarea name="description" className="input" rows={2} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="billable" defaultChecked /> Billable</label>
            </JsonForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
