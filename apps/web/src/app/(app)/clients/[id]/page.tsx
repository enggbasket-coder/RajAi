import Link from "next/link";
import { ClientService } from "@trackwise/core";
import { hasPermission } from "@trackwise/rbac";
import { requireActor } from "@/lib/session";
import { ActionButton, JsonForm } from "@/components/forms";
import { Badge, Card, Empty, Field, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const client = await ClientService.get(actor, id);
  const canWrite = hasPermission(actor.role, "clients:write");
  return (
    <>
      <PageHeader title={client.name} subtitle={client.code ? `Code ${client.code}` : undefined} actions={canWrite ? <ActionButton action={`/api/clients/${client.id}`} method="DELETE" className="btn-danger btn-sm" confirm="Delete or deactivate this client?" redirectTo="/clients">Delete</ActionButton> : null} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Projects" actions={<Link href={`/projects?clientId=${client.id}`} className="text-xs text-brand-600 hover:underline">New project</Link>}>
            {client.projects.length === 0 ? <Empty>No projects for this client.</Empty> : (
              <table className="table">
                <thead><tr><th>Project</th><th>Code</th><th>Status</th><th>Billable</th></tr></thead>
                <tbody>
                  {client.projects.map((p) => (
                    <tr key={p.id}>
                      <td><Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-brand-600">{p.name}</Link></td>
                      <td className="text-slate-500">{p.code ?? "—"}</td>
                      <td><Badge value={p.status} /></td>
                      <td>{p.billable ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
        {canWrite ? (
          <Card title="Edit client">
            <JsonForm action={`/api/clients/${client.id}`} method="PATCH" submitLabel="Save" className="space-y-3" successMessage="Saved">
              <Field label="Name"><input name="name" className="input" defaultValue={client.name} required /></Field>
              <Field label="Code"><input name="code" className="input" defaultValue={client.code ?? ""} /></Field>
              <Field label="Notes"><textarea name="notes" className="input" rows={3} defaultValue={client.notes ?? ""} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={client.active} /> Active</label>
            </JsonForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
