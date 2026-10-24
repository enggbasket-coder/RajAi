import Link from "next/link";
import { ClientService } from "@trackwise/core";
import { requireActor } from "@/lib/session";
import { JsonForm } from "@/components/forms";
import { Card, Empty, Field, PageHeader } from "@/components/ui";
import { hasPermission } from "@trackwise/rbac";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const actor = await requireActor();
  const clients = await ClientService.list(actor, { includeInactive: true });
  return (
    <>
      <PageHeader title="Clients" subtitle="Clients own projects; projects own tasks and time." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            {clients.length === 0 ? <Empty>No clients yet.</Empty> : (
              <table className="table">
                <thead><tr><th>Name</th><th>Code</th><th>Projects</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id}>
                      <td><Link href={`/clients/${c.id}`} className="font-medium text-slate-900 hover:text-brand-600">{c.name}</Link></td>
                      <td className="text-slate-500">{c.code ?? "—"}</td>
                      <td>{c._count.projects}</td>
                      <td>{c.active ? <span className="badge bg-emerald-100 text-emerald-800">Active</span> : <span className="badge bg-slate-200 text-slate-600">Inactive</span>}</td>
                      <td className="text-right"><Link href={`/clients/${c.id}`} className="btn-secondary btn-sm">{hasPermission(actor.role, "clients:write") ? "Edit" : "Open"}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
        {hasPermission(actor.role, "clients:write") ? (
          <Card title="New client">
            <JsonForm action="/api/clients" submitLabel="Create client" className="space-y-3">
              <Field label="Name"><input name="name" className="input" required /></Field>
              <Field label="Code"><input name="code" className="input" placeholder="Optional short code" /></Field>
              <Field label="Notes"><textarea name="notes" className="input" rows={3} /></Field>
            </JsonForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
