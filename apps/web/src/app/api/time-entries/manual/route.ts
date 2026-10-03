import { z } from "zod";
import { TimerService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const POST = withActor(async (req, actor) => {
  const body = await parseBody(req, z.object({ projectId: z.string().min(1), taskId: z.string().nullable().optional().transform((v) => v || null), startedAt: z.string().min(1), stoppedAt: z.string().min(1), reason: z.string().min(1), billable: z.boolean().optional() }));
  return json({ entry: await TimerService.addManual(actor, { ...body, startedAt: new Date(body.startedAt), stoppedAt: new Date(body.stoppedAt) }) }, { status: 201 });
});
