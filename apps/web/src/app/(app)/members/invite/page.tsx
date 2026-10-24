
import { assignableRoles } from "@trackwise/rbac";
import { guard, requireActor } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { InviteForm } from "./InviteForm";

export default async function InvitePage() {
  const actor = await requireActor();
  guard(actor, "members:invite");
  return (
    <>
      <PageHeader title="Invite member" subtitle="Invitations expire after 7 days. Trackwise does not send email in the MVP: copy the link and share it." />
      <Card className="max-w-lg"><InviteForm roles={assignableRoles(actor.role)} /></Card>
    </>
  );
}
