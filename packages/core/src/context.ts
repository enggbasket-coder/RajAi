import type { Actor } from "@trackwise/auth";
import { hasPermission, type Permission } from "@trackwise/rbac";
import { forbidden } from "@trackwise/shared";

export type { Actor };

export function requirePermission(actor: Actor, permission: Permission): void {
  if (!hasPermission(actor.role, permission)) throw forbidden(`Missing permission: ${permission}`);
}

export function can(actor: Actor, permission: Permission): boolean {
  return hasPermission(actor.role, permission);
}

export const APP_URL = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

/** Platform (PlusBrains) operators: emails listed in PLATFORM_ADMIN_EMAILS. They see cross-organization usage. */
export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.PLATFORM_ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}
