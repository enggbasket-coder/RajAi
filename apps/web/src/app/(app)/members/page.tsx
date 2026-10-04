import Link from "next/link";
import {InvitationService, MemberService} from "@trackwise/core";
import { assignableRoles, isAdminLike } from "@trackwise/rbac";
import { guard, requireActor } from "@/lib/session";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { MemberRow } from "./MemberRow";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const actor = await requireActor();
  guard(actor, "members:invite");
  const [members, invitations] = await Promise.all([MemberService.list(actor, { includeInactive: true }), InvitationService.list(actor)]);
  const admin = isAdminLike(actor.role);
  return (
    <>
      <PageHeader title="Members" actions={<Link href="/members/invite" className="btn-primary">＋ Invite member</Link>} />
      <div className="space-y-6">
        <Card>
          <table className="table">
            <thead><tr><th>Member</th><th>Role</th><th>WhatsApp</th><th>Telegram</th><th>Preferred channel</th><th>Status</th>{admin ? <th></th> : null}</tr></thead>
            <tbody>
              {members.map((m) => (
                <MemberRow key={m.userId} member={{ ...m, lastSeenAt: m.lastSeenAt?.toISOString() ?? null }} canManage={admin && m.userId !== actor.userId && m.role !== "OWNER"} canRename={admin || m.userId === actor.userId} roles={assignableRoles(actor.role)} />
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Pending invitations">
          {invitations.length === 0 ? <Empty>No pending invitations.</Empty> : (
            <table className="table">
              <thead><tr><th>Email</th><th>Role</th><th>Expires</th></tr></thead>
              <tbody>{invitations.map((i) => <tr key={i.id}><td>{i.email}</td><td><Badge value={i.role} /></td><td className="text-slate-600">{i.expiresAt.toISOString().slice(0, 10)}</td></tr>)}</tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
