import { TimesheetService } from "@trackwise/core";
import { json, withActor } from "@/lib/api";
export const POST = withActor(async (_req, actor, params) => json({ timesheet: await TimesheetService.approve(actor, params.id) }));
