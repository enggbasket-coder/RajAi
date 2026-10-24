import { z } from "zod";
import { authenticate, createSession, listMemberships, SESSION_COOKIE } from "@trackwise/auth";
import { json, parseBody, withPublic } from "@/lib/api";
import { ORG_COOKIE } from "@/lib/session";

const schema = z.object({ email: z.string().email(), password: z.string().min(1), client: z.enum(["web", "desktop"]).default("web") });

export const POST = withPublic(async (req) => {
  const { email, password, client } = await parseBody(req, schema);
  const user = await authenticate(email, password);
  const { token, expiresAt } = await createSession(user.id, client);
  const memberships = await listMemberships(user.id);
  if (client === "desktop") {
    return json({ token, expiresAt, user: { id: user.id, name: user.name, email: user.email }, organizations: memberships.map((m) => ({ id: m.organizationId, name: m.organization.name, role: m.role })) });
  }
  const res = json({ ok: true, organizations: memberships.length });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", expires: expiresAt, path: "/" });
  if (memberships[0]) res.cookies.set(ORG_COOKIE, memberships[0].organizationId, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
});
