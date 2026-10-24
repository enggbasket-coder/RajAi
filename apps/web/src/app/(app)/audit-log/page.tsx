import {AuditService, MemberService} from "@trackwise/core";
import { prisma } from "@trackwise/database";
import { guard, requireActor } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ action?: string; entityType?: string }> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  guard(actor, "audit:read");
  const [logs, members, org] = await Promise.all([AuditService.list(actor.organizationId, { action: sp.action, entityType: sp.entityType, limit: 200 }), MemberService.list(actor, { includeInactive: true }), prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } })]);
  const name = (id: string | null) => (id ? members.find((m) => m.userId === id)?.name ?? id.slice(0, 8) : "System");
  return (
    <>
      <PageHeader title="Audit log" subtitle="Append-only. Every sensitive action is recorded with actor, entity and metadata." />
      <form method="GET" className="mb-4 flex gap-2">
        <input name="action" className="input w-56" placeholder="action, e.g. task.accepted" defaultValue={sp.action ?? ""} />
        <input name="entityType" className="input w-48" placeholder="entity type" defaultValue={sp.entityType ?? ""} />
        <button className="btn-secondary">Filter</button>
      </form>
      <Card>
        {logs.length === 0 ? <Empty>No audit entries.</Empty> : (
          <table className="table">
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Metadata</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-slate-600">{formatDateTime(l.createdAt, org.timezone)}</td>
                  <td>{name(l.actorUserId)}</td>
                  <td><code className="text-xs">{l.action}</code></td>
                  <td className="text-slate-600">{l.entityType}<span className="ml-1 font-mono text-[10px] text-slate-400">{l.entityId?.slice(-6)}</span></td>
                  <td><code className="block max-w-md truncate text-[11px] text-slate-500" title={JSON.stringify(l.metadataJson)}>{JSON.stringify(l.metadataJson)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
