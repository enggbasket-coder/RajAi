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
