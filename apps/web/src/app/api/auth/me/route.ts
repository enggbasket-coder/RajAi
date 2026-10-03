import { listMemberships } from "@trackwise/auth";
import { json, withUser } from "@/lib/api";
import { getCurrentActor } from "@/lib/session";

export const GET = withUser(async (_req, user) => {
  const [memberships, actor] = await Promise.all([listMemberships(user.id), getCurrentActor()]);
  return json({ user, organizations: memberships.map((m) => ({ id: m.organizationId, name: m.organization.name, role: m.role })), currentOrganizationId: actor?.organizationId ?? null, role: actor?.role ?? null });
});
