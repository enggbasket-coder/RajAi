import { TimesheetService } from "@trackwise/core";
import { json, withActor } from "@/lib/api";

export const GET = withActor(async (req, actor) => {
  const q = req.nextUrl.searchParams;
  const date = q.get("date") ? new Date(q.get("date")!) : new Date();
  return json(await TimesheetService.getWeek(actor, q.get("userId") ?? actor.userId, date));
});
