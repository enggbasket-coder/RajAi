import { z } from "zod";
import { TimesheetService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";
export const POST = withActor(async (req, actor, params) => {
  const { reason } = await parseBody(req, z.object({ reason: z.string().optional() }));
  return json({ timesheet: await TimesheetService.reopen(actor, params.id, reason) });
});
