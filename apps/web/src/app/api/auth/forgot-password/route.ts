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
    if (process.env.ENABLE_DEV_TOOLS === "true" && process.env.NODE_ENV !== "production") return json({ ok: true, devResetUrl: url });
  }
  return json({ ok: true });
});
