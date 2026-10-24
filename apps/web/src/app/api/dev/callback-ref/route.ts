import { prisma } from "@trackwise/database";
import { signRef } from "@trackwise/shared";
import { requirePermission } from "@trackwise/core";
import { json, withActor } from "@/lib/api";

/** Dev-only: returns the signed Telegram callback ref for an assignment so the mock console can "press" a button. */
export const GET = withActor(async (req, actor) => {
  if (process.env.ENABLE_DEV_TOOLS !== "true") return json({ error: "Dev tools disabled" }, { status: 404 });
  requirePermission(actor, "messaging:configure");
  const assignmentId = req.nextUrl.searchParams.get("assignmentId") ?? "";
  const prefix = req.nextUrl.searchParams.get("prefix") === "rej" ? "rej" : "acc";
  const a = await prisma.taskAssignment.findFirst({ where: { id: assignmentId, organizationId: actor.organizationId } });
  if (!a) return json({ error: "Not found" }, { status: 404 });
  return json({ data: signRef(prefix, a.id) });
});
