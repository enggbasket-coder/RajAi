import { z } from "zod";
import { mockMessaging } from "@trackwise/messaging";
import { requirePermission } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const GET = withActor(async (_req, actor) => {
  if (process.env.ENABLE_DEV_TOOLS !== "true") return json({ error: "Dev tools disabled" }, { status: 404 });
  requirePermission(actor, "messaging:configure");
  return json({ outbox: mockMessaging.outbox().slice(-50).reverse() });
});

export const POST = withActor(async (req, actor) => {
  if (process.env.ENABLE_DEV_TOOLS !== "true") return json({ error: "Dev tools disabled" }, { status: 404 });
  requirePermission(actor, "messaging:configure");
  const body = await parseBody(req, z.object({ provider: z.enum(["WHATSAPP", "TELEGRAM"]), mode: z.enum(["none", "temporary", "permanent"]).optional(), failNext: z.number().int().nonnegative().optional() }));
  if (body.mode) mockMessaging.setFailure(body.provider, body.mode);
  if (body.failNext !== undefined) mockMessaging.failNext(body.provider, body.failNext);
  return json({ ok: true });
});
