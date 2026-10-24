import { TimesheetService } from "@trackwise/core";
import { json, withActor } from "@/lib/api";

export const GET = withActor(async (req, actor) => {
  const q = req.nextUrl.searchParams;
  return json({ timesheets: await TimesheetService.list(actor, { status: (q.get("status") as never) ?? undefined, userId: q.get("userId") ?? undefined }) });
});
