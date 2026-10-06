import { z } from "zod";
import { AssignmentService, notifyAssignmentAccepted, notifyAssignmentRejected } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const POST = withActor(async (req, actor, params) => {
  const { action, reason } = await parseBody(req, z.object({ action: z.enum(["ACCEPT", "REJECT"]), reason: z.string().optional() }));
  const r = await AssignmentService.respondAsActor(actor, params.id, action, reason);
  if (r.changed) {
    if (r.outcome === "ACCEPTED") await notifyAssignmentAccepted(params.id);
    else await notifyAssignmentRejected(params.id);
  }
  return json({ outcome: r.outcome, changed: r.changed });
});
