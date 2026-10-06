import { NextResponse, type NextRequest } from "next/server";
import { findConnectionById, getProvider, processInboundEvent } from "@trackwise/core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await ctx.params;
  const connection = await findConnectionById(connectionId);
  if (!connection || connection.row.provider !== "TELEGRAM" || !connection.row.enabled) return new NextResponse("Not found", { status: 404 });
  const provider = getProvider("TELEGRAM");
  const rawBody = await req.text();
  if (!provider.isMock) {
    const valid = await provider.verifyWebhook(connection.conn, { method: "POST", headers: { "x-telegram-bot-api-secret-token": req.headers.get("x-telegram-bot-api-secret-token") ?? undefined }, rawBody, query: {} });
    if (!valid) return new NextResponse("Invalid secret", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }
  const summary = await processInboundEvent("TELEGRAM", payload, { connectionId });
  // Always 200 so Telegram does not re-deliver; failures are stored on the webhook event row.
  return NextResponse.json({ ok: true, ...(process.env.ENABLE_DEV_TOOLS === "true" ? summary : {}) });
}
