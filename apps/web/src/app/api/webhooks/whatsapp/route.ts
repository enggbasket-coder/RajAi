import { NextResponse, type NextRequest } from "next/server";
import { findWhatsAppConnectionByPhoneNumberId, getProvider, processInboundEvent } from "@trackwise/core";
import { WhatsAppMessagingProvider } from "@trackwise/whatsapp";

export const dynamic = "force-dynamic";

/** Meta verification handshake. */
export async function GET(req: NextRequest) {
  const q = Object.fromEntries(req.nextUrl.searchParams.entries());
  // Always use the real verifier for the handshake (mock mode must not accept arbitrary tokens).
  const verifier = new WhatsAppMessagingProvider();
  const ok = q["hub.mode"] === "subscribe" && (await verifier.verifyWebhook(null, { method: "GET", headers: {}, rawBody: "", query: q }));
  if (!ok) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(q["hub.challenge"] ?? "", { status: 200 });
}

/** Inbound messages & statuses. Signature is validated against the connection's app secret before parsing. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const headers: Record<string, string | undefined> = { "x-hub-signature-256": req.headers.get("x-hub-signature-256") ?? undefined };
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }
  const provider = getProvider("WHATSAPP");
  const hint = (payload as { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string } } }[] }[] })?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? null;
  const connection = await findWhatsAppConnectionByPhoneNumberId(hint);
  if (!provider.isMock) {
    const valid = await provider.verifyWebhook(connection?.conn ?? null, { method: "POST", headers, rawBody, query: {} });
    if (!valid) return new NextResponse("Invalid signature", { status: 401 });
  }
  // Return quickly: Meta retries on slow responses. Processing is idempotent either way.
  const summary = await processInboundEvent("WHATSAPP", payload);
  return NextResponse.json({ ok: true, ...(process.env.ENABLE_DEV_TOOLS === "true" ? summary : {}) });
}
