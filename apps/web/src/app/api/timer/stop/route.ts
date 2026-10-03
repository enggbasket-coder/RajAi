import { z } from "zod";
import { TimerService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const POST = withActor(async (req, actor) => {
  const { discardIdleSeconds } = await parseBody(req, z.object({ discardIdleSeconds: z.number().int().nonnegative().optional() }));
  return json({ entry: await TimerService.stop(actor, { discardIdleSeconds }) });
});
