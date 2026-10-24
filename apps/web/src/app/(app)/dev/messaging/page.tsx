import { notFound } from "next/navigation";
import { MemberService } from "@trackwise/core";
import { prisma } from "@trackwise/database";
import { guard, requireActor } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { MockConsole } from "./MockConsole";

export const dynamic = "force-dynamic";

export default async function MockConsolePage() {
  if (process.env.ENABLE_DEV_TOOLS !== "true") notFound();
  const actor = await requireActor();
  guard(actor, "messaging:configure");
  const members = await MemberService.list(actor);
  const identities = await prisma.userMessagingIdentity.findMany({ where: { organizationId: actor.organizationId } });
  const pending = await prisma.taskAssignment.findMany({ where: { organizationId: actor.organizationId, status: "PENDING" }, include: { task: true, deliveries: true }, orderBy: { assignedAt: "desc" }, take: 20 });
  const recent = await prisma.communicationMessage.findMany({ where: { organizationId: actor.organizationId, channel: { in: ["WHATSAPP", "TELEGRAM"] } }, orderBy: { createdAt: "desc" }, take: 40 });
  return (
    <>
      <PageHeader title="Mock messaging console" subtitle={`WHATSAPP_PROVIDER=${process.env.WHATSAPP_PROVIDER ?? "mock"} · TELEGRAM_PROVIDER=${process.env.TELEGRAM_PROVIDER ?? "mock"}. Simulated events go through the real webhook pipeline.`} />
      <MockConsole
        people={members.map((m) => ({ userId: m.userId, name: m.name, role: m.role, wa: identities.find((i) => i.userId === m.userId && i.provider === "WHATSAPP")?.providerUserId ?? null, tg: identities.find((i) => i.userId === m.userId && i.provider === "TELEGRAM")?.providerUserId ?? null }))}
        pending={pending.map((a) => ({ id: a.id, title: a.task.title, userId: a.userId, deliveries: a.deliveries.map((d) => ({ channel: d.channel, status: d.status, externalMessageId: d.externalMessageId })) }))}
        recent={recent.map((m) => ({ id: m.id, at: m.createdAt.toISOString(), channel: m.channel, direction: m.direction, body: m.body, status: m.status, userId: m.userId, meta: m.metadataJson as Record<string, unknown>, externalMessageId: m.externalMessageId }))}
      />
    </>
  );
}
