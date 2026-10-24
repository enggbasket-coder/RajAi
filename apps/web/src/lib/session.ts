import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserBySessionToken, listMemberships, resolveActor, SESSION_COOKIE, type Actor, type AuthUser } from "@trackwise/auth";

export const ORG_COOKIE = "tw_org";

export async function sessionTokenFromRequest(): Promise<string | null> {
  const h = await headers();
  const auth = h.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const c = await cookies();
  return c.get(SESSION_COOKIE)?.value ?? null;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  return getUserBySessionToken(await sessionTokenFromRequest());
}

export async function getCurrentActor(): Promise<Actor | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const h = await headers();
  const c = await cookies();
  const orgId = h.get("x-organization-id") || c.get(ORG_COOKIE)?.value || null;
  return (await resolveActor(user, orgId)) ?? (orgId ? resolveActor(user, null) : null);
}

/** For pages: redirect to login (or onboarding) when there is no actor. */
export async function requireActor(): Promise<Actor> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = await getCurrentActor();
  if (!actor) {
    const memberships = await listMemberships(user.id);
    if (memberships.length === 0) redirect("/onboarding");
    redirect("/login");
  }
  return actor;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

import { hasPermission, type Permission } from "@trackwise/rbac";

/** For pages: redirect to a friendly 403 page instead of throwing. */
export function guard(actor: Actor, permission: Permission): void {
  if (!hasPermission(actor.role, permission)) redirect(`/forbidden?need=${permission}`);
}
