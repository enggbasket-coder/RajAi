import { z } from "zod";
import { ConnectionService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const POST = withActor(async (req, actor) => {
  const body = await parseBody(req, z.object({ wabaId: z.string().optional(), phoneNumberId: z.string().min(1), displayPhoneNumber: z.string().optional(), accessToken: z.string().optional(), appSecret: z.string().optional(), verifyToken: z.string().optional(), assignmentTemplateName: z.string().optional(), enabled: z.boolean().optional() }));
  return json({ connection: await ConnectionService.configureWhatsApp(actor, body) });
});
