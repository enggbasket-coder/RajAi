import { z } from "zod";
import { prisma } from "@trackwise/database";
import { MessagingService, requirePermission } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const POST = withActor(async (req, actor, params) => {
  requirePermission(actor, "tasks:assign");
  const a = await prisma.taskAssignment.findFirst({ where: { id: params.id, organizationId: actor.organizationId } });
  if (!a) return json({ error: "Assignment not found" }, { status: 404 });
  const { sendVia } = await parseBody(req, z.object({ sendVia: z.enum(["PREFERENCE", "WHATSAPP", "TELEGRAM", "BOTH", "WEB"]).optional() }));
  return json(await MessagingService.sendAssignment(a.id, { sendVia, actorUserId: actor.userId }));
});
