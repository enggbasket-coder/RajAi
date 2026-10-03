import { z } from "zod";
import { resolveActor } from "@trackwise/auth";
import { json, parseBody, withUser } from "@/lib/api";
import { ORG_COOKIE } from "@/lib/session";

export const POST = withUser(async (req, user) => {
  const { organizationId } = await parseBody(req, z.object({ organizationId: z.string() }));
  const actor = await resolveActor(user, organizationId);
  if (!actor) return json({ error: "Not a member of that organization" }, { status: 403 });
  const res = json({ ok: true });
  res.cookies.set(ORG_COOKIE, organizationId, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
});
