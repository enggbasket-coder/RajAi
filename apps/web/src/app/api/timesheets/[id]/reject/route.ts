import { z } from "zod";
import { TimesheetService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";
export const POST = withActor(async (req, actor, params) => {
  const { comment } = await parseBody(req, z.object({ comment: z.string().min(1) }));
  return json({ timesheet: await TimesheetService.reject(actor, params.id, comment) });
});
