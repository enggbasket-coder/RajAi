import { z } from "zod";
import { ClientService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const GET = withActor(async (_req, actor, params) => json({ client: await ClientService.get(actor, params.id) }));
export const PATCH = withActor(async (req, actor, params) => json({ client: await ClientService.update(actor, params.id, await parseBody(req, z.object({ name: z.string().min(1).optional(), code: z.string().nullable().optional(), notes: z.string().nullable().optional(), active: z.boolean().optional() }))) }));
export const DELETE = withActor(async (_req, actor, params) => {
  await ClientService.remove(actor, params.id);
  return json({ ok: true });
});
