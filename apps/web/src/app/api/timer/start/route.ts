import { z } from "zod";
import { TimerService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const POST = withActor(async (req, actor) => {
  const { taskId, source } = await parseBody(req, z.object({ taskId: z.string().min(1), source: z.enum(["WEB", "DESKTOP", "MOBILE"]).default("WEB") }));
  return json(await TimerService.start(actor, taskId, source));
});
