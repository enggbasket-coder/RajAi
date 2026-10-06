import { z } from "zod";
import { IdentityService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const DELETE = withActor(async (_req, actor, params) => {
  await IdentityService.remove(actor, params.id, params.identityId);
  return json({ ok: true });
});
export const PATCH = withActor(async (req, actor, params) => {
  const { disabled } = await parseBody(req, z.object({ disabled: z.boolean() }));
  await IdentityService.setDisabled(actor, params.id, params.identityId, disabled);
  return json({ ok: true });
});
