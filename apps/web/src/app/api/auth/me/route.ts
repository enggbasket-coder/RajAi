import { z } from "zod";
import { listMemberships, updateProfile } from "@trackwise/auth";
import { isValidTimeZone } from "@trackwise/shared";
import { json, parseBody, withUser } from "@/lib/api";
import { getCurrentActor } from "@/lib/session";

export const GET = withUser(async (_req, user) => {
  const [memberships, actor] = await Promise.all([listMemberships(user.id), getCurrentActor()]);
  return json({ user, organizations: memberships.map((m) => ({ id: m.organizationId, name: m.organization.name, role: m.role })), currentOrganizationId: actor?.organizationId ?? null, role: actor?.role ?? null });
});

export const PATCH = withUser(async (req, user) => {
  const body = await parseBody(req, z.object({ name: z.string().min(1).optional(), timezone: z.string().nullable().optional() }));
  if (body.timezone && !isValidTimeZone(body.timezone)) return json({ error: "Invalid timezone" }, { status: 400 });
  const updated = await updateProfile(user.id, body);
  return json({ user: { id: updated.id, name: updated.name, email: updated.email, timezone: updated.timezone } });
});
