import { TimerService } from "@trackwise/core";
import { json, withActor } from "@/lib/api";

export const GET = withActor(async (req, actor) => {
  const q = req.nextUrl.searchParams;
  return json({ entries: await TimerService.listEntries(actor, { userId: q.get("userId") ?? undefined, from: q.get("from") ? new Date(q.get("from")!) : undefined, to: q.get("to") ? new Date(q.get("to")!) : undefined, projectId: q.get("projectId") ?? undefined, status: q.get("status") ?? undefined }) });
});
