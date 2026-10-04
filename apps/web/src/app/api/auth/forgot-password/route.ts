import { z } from "zod";
import { createPasswordReset } from "@trackwise/auth";
import { json, parseBody, withPublic } from "@/lib/api";

export const POST = withPublic(async (req) => {
  const { email } = await parseBody(req, z.object({ email: z.string().email() }));
  const r = await createPasswordReset(email);
  // No email provider in the MVP: the link is logged server-side (never returned to the client in production).
  if (r) {
    const url = `${process.env.APP_URL || "http://localhost:3000"}/reset-password/${r.token}`;
    console.info(`[trackwise] Password reset link for ${email}: ${url}`);
    // No email provider yet: with dev tools enabled the link is returned so an admin can hand it over.
    if (process.env.ENABLE_DEV_TOOLS === "true") return json({ ok: true, devResetUrl: url });
  }
  return json({ ok: true });
});
