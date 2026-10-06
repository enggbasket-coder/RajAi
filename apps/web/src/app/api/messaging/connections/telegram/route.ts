import { z } from "zod";
import { ConnectionService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const POST = withActor(async (req, actor) => {
  const body = await parseBody(req, z.object({ botToken: z.string().optional(), botUsername: z.string().optional(), enabled: z.boolean().optional() }));
  return json({ connection: await ConnectionService.configureTelegram(actor, { ...body, botToken: body.botToken || undefined }) });
});
