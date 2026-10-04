import { z } from "zod";
import { TimerService } from "@trackwise/core";
import { dateInTz, json, orgTimeZone, parseBody, withActor } from "@/lib/api";

export const PATCH = withActor(async (req, actor, params) => {
  const body = await parseBody(req, z.object({ startedAt: z.string().optional(), stoppedAt: z.string().optional(), taskId: z.string().nullable().optional(), projectId: z.string().optional(), billable: z.boolean().optional(), manualReason: z.string().optional() }));
  const tz = await orgTimeZone(actor.organizationId);
  return json({ entry: await TimerService.updateEntry(actor, params.id, { ...body, startedAt: body.startedAt ? dateInTz(body.startedAt, tz)! : undefined, stoppedAt: body.stoppedAt ? dateInTz(body.stoppedAt, tz)! : undefined }) });
});
export const DELETE = withActor(async (_req, actor, params) => {
  await TimerService.deleteEntry(actor, params.id);
  return json({ ok: true });
});
