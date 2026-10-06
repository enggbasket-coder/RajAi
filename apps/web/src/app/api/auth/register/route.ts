import { z } from "zod";
import { createSession, registerUser, SESSION_COOKIE } from "@trackwise/auth";
import { OrganizationService } from "@trackwise/core";
import { json, parseBody, withPublic } from "@/lib/api";
import { ORG_COOKIE } from "@/lib/session";

const schema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8), organizationName: z.string().min(1), timezone: z.string().default("UTC") });

export const POST = withPublic(async (req) => {
  const body = await parseBody(req, schema);
  const user = await registerUser(body);
  const org = await OrganizationService.create(user.id, { name: body.organizationName, timezone: body.timezone });
  const { token, expiresAt } = await createSession(user.id);
  const res = json({ ok: true, organizationId: org.id });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", expires: expiresAt, path: "/" });
  res.cookies.set(ORG_COOKIE, org.id, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
});
