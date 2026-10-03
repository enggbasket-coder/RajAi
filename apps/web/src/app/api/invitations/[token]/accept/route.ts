import { z } from "zod";
import { createSession, registerUser, SESSION_COOKIE } from "@trackwise/auth";
import { InvitationService } from "@trackwise/core";
import { json, parseBody, withPublic } from "@/lib/api";
import { getCurrentUser, ORG_COOKIE } from "@/lib/session";

export const POST = withPublic(async (req, params) => {
  const inv = await InvitationService.getByToken(params.token);
  if (!inv) return json({ error: "Invitation is invalid or expired" }, { status: 404 });
  let user = await getCurrentUser();
  let newToken: { token: string; expiresAt: Date } | null = null;
  if (!user) {
    const body = await parseBody(req, z.object({ name: z.string().min(1), password: z.string().min(8), email: z.string().email().optional() }));
    const created = await registerUser({ name: body.name, email: inv.email, password: body.password });
    user = { id: created.id, email: created.email, name: created.name, timezone: created.timezone };
    newToken = await createSession(created.id);
  }
  const member = await InvitationService.accept(params.token, user.id);
  const res = json({ ok: true, organizationId: member.organizationId });
  if (newToken) res.cookies.set(SESSION_COOKIE, newToken.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", expires: newToken.expiresAt, path: "/" });
  res.cookies.set(ORG_COOKIE, member.organizationId, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
});
