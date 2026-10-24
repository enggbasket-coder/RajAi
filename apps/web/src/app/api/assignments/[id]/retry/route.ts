import { z } from "zod";
import { MessagingService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const POST = withActor(async (req, actor, params) => {
  const { channel } = await parseBody(req, z.object({ channel: z.enum(["WHATSAPP", "TELEGRAM"]).optional() }));
  return json(await MessagingService.retry(actor, params.id, channel));
});
