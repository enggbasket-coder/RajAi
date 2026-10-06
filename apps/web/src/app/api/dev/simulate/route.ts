import { z } from "zod";
import { prisma } from "@trackwise/database";
import { processInboundEvent, requirePermission } from "@trackwise/core";
import { buildWhatsAppInboundPayload, buildWhatsAppStatusPayload } from "@trackwise/whatsapp";
import { buildTelegramCallbackUpdate, buildTelegramMessageUpdate } from "@trackwise/telegram";
import { json, parseBody, withActor } from "@/lib/api";

const schema = z.object({
  provider: z.enum(["WHATSAPP", "TELEGRAM"]),
  kind: z.enum(["message", "callback", "status"]),
  from: z.string().min(1),
  text: z.string().optional(),
  data: z.string().optional(),
  messageId: z.string().optional(),
  status: z.enum(["sent", "delivered", "read", "failed"]).optional(),
});

/** Developer console: feed a provider-shaped payload through the real webhook pipeline (mock mode only). */
export const POST = withActor(async (req, actor) => {
  if (process.env.ENABLE_DEV_TOOLS !== "true") return json({ error: "Dev tools disabled" }, { status: 404 });
  requirePermission(actor, "messaging:configure");
  const body = await parseBody(req, schema);
  const connection = await prisma.messagingConnection.findUnique({ where: { organizationId_provider: { organizationId: actor.organizationId, provider: body.provider } } });
  if (!connection) return json({ error: `${body.provider} is not configured for this organization` }, { status: 400 });
  let payload: unknown;
  if (body.provider === "WHATSAPP") {
    if (body.kind === "status") payload = buildWhatsAppStatusPayload({ phoneNumberId: connection.phoneNumberId ?? "", messageId: body.messageId ?? "", status: body.status ?? "delivered", recipient: body.from, error: body.status === "failed" ? { code: 131026, title: "Message undeliverable" } : undefined });
    else payload = buildWhatsAppInboundPayload({ phoneNumberId: connection.phoneNumberId ?? "", from: body.from, text: body.text ?? "", messageId: body.messageId || `wamid.sim.${Date.now()}` });
    return json(await processInboundEvent("WHATSAPP", payload));
  }
  payload = body.kind === "callback" ? buildTelegramCallbackUpdate({ userId: body.from, data: body.data ?? "", messageId: body.messageId ? Number(body.messageId) : undefined }) : buildTelegramMessageUpdate({ userId: body.from, text: body.text ?? "" });
  return json(await processInboundEvent("TELEGRAM", payload, { connectionId: connection.id }));
});
