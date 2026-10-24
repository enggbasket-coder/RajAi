import { z } from "zod";
import { ConnectionService, MessagingService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const POST = withActor(async (req, actor) => {
  const body = await parseBody(req, z.object({ provider: z.enum(["WHATSAPP", "TELEGRAM"]), enabled: z.boolean().optional(), test: z.boolean().optional() }));
  if (body.test) {
    const r = await MessagingService.sendToUser({ organizationId: actor.organizationId, userId: actor.userId, channel: body.provider, text: `Trackwise test message ✅ (${new Date().toISOString()})`, messageType: "SYSTEM" });
    return json({ result: r });
  }
  return json({ connection: await ConnectionService.setEnabled(actor, body.provider, body.enabled ?? true) });
});
