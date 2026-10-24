import { AssignmentService } from "@trackwise/core";
import { json, withActor } from "@/lib/api";

export const POST = withActor(async (_req, actor, params) => {
  await AssignmentService.cancel(actor, params.id);
  return json({ ok: true });
});
