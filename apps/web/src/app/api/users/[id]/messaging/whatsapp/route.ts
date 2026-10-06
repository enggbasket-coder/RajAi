import { z } from "zod";
import { IdentityService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const POST = withActor(async (req, actor, params) => {
  const body = await parseBody(req, z.object({ phone: z.string().min(5), optIn: z.boolean().default(true), defaultCountryCode: z.string().optional() }));
  const identity = await IdentityService.setWhatsApp(actor, params.id, body);
  return json({ identity: { id: identity.id, phone: identity.phoneNumber, verified: identity.verified, optedIn: identity.optedIn } });
});

export const PATCH = withActor(async (req, actor, params) => {
  const { optIn } = await parseBody(req, z.object({ optIn: z.boolean() }));
  const identity = await IdentityService.setWhatsAppOptIn(actor, params.id, optIn);
  return json({ identity: { id: identity.id, optedIn: identity.optedIn } });
});
