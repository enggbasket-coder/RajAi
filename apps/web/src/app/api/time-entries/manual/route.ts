import { z } from "zod";
import { TimerService } from "@trackwise/core";
import { dateInTz, json, orgTimeZone, parseBody, withActor } from "@/lib/api";

export const POST = withActor(async (req, actor) => {
  const body = await parseBody(req, z.object({ projectId: z.string().min(1), taskId: z.string().nullable().optional().transform((v) => v || null), startedAt: z.string().min(1), stoppedAt: z.string().min(1), reason: z.string().min(1), billable: z.boolean().optional() }));
  const tz = await orgTimeZone(actor.organizationId);
  return json({ entry: await TimerService.addManual(actor, { ...body, startedAt: dateInTz(body.startedAt, tz)!, stoppedAt: dateInTz(body.stoppedAt, tz)! }) }, { status: 201 });
});
