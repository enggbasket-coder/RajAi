import { MemberService, ProjectService } from "@trackwise/core";

import { prisma } from "@trackwise/database";
import { SEND_VIA_OPTIONS } from "@trackwise/shared";
import { guard, requireActor } from "@/lib/session";
import { AssignTaskForm } from "./AssignTaskForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  guard(actor, "tasks:assign");
  const [projects, members, org] = await Promise.all([ProjectService.list(actor), MemberService.list(actor), prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } })]);
  return (
    <>
      <PageHeader title="New assignment" subtitle="Create a task, pick assignees and send it through the channel each employee is ready for." />
      <AssignTaskForm
        projects={projects.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId, clientName: p.client?.name ?? null, billable: p.billable }))}
        members={members.filter((m) => m.active).map((m) => ({ userId: m.userId, name: m.name, role: m.role, channels: m.channels, preferred: m.preferredAssignmentChannel }))}
        defaultProjectId={sp.projectId ?? null}
        defaultBillable={org.defaultBillable}
        defaultChannel={org.defaultManagementChannel}
        sendViaOptions={SEND_VIA_OPTIONS}
      />
    </>
  );
}
