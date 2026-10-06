import { z } from "zod";
import { assignExistingTask } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const POST = withActor(async (req, actor, params) => {
  const body = await parseBody(req, z.object({ assigneeUserIds: z.array(z.string()).min(1), sendVia: z.enum(["PREFERENCE", "WHATSAPP", "TELEGRAM", "BOTH", "WEB"]).default("PREFERENCE") }));
  return json(await assignExistingTask(actor, params.id, body.assigneeUserIds, body.sendVia));
});
