import { ROLE_RANK, type Role } from "@trackwise/shared";

export type Permission =
  | "org:manage"
  | "org:billing"
  | "members:manage"
  | "members:invite"
  | "clients:read"
  | "clients:write"
  | "projects:read"
  | "projects:write"
  | "tasks:read"
  | "tasks:create"
  | "tasks:assign"
  | "tasks:complete"
  | "time:read_team"
  | "time:read_own"
  | "timesheets:approve"
  | "reports:team"
  | "reports:own"
  | "messaging:configure"
  | "messaging:retry"
  | "audit:read"
  | "live_team:read";

const MATRIX: Record<Role, Permission[]> = {
  OWNER: [
    "org:manage", "org:billing", "members:manage", "members:invite",
    "clients:read", "clients:write", "projects:read", "projects:write",
    "tasks:read", "tasks:create", "tasks:assign", "tasks:complete",
    "time:read_team", "time:read_own", "timesheets:approve",
    "reports:team", "reports:own", "messaging:configure", "messaging:retry",
    "audit:read", "live_team:read",
  ],
  ADMIN: [
    "org:manage", "members:manage", "members:invite",
    "clients:read", "clients:write", "projects:read", "projects:write",
    "tasks:read", "tasks:create", "tasks:assign", "tasks:complete",
    "time:read_team", "time:read_own", "timesheets:approve",
    "reports:team", "reports:own", "messaging:configure", "messaging:retry",
    "audit:read", "live_team:read",
  ],
  MANAGER: [
    "members:invite",
    "clients:read", "clients:write", "projects:read", "projects:write",
    "tasks:read", "tasks:create", "tasks:assign", "tasks:complete",
    "time:read_team", "time:read_own", "timesheets:approve",
    "reports:team", "reports:own", "messaging:retry", "live_team:read",
  ],
  EMPLOYEE: ["clients:read", "projects:read", "tasks:read", "tasks:complete", "time:read_own", "reports:own"],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function isAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export function isManagerial(role: Role): boolean {
  return isAtLeast(role, "MANAGER");
}

export function isAdminLike(role: Role): boolean {
  return isAtLeast(role, "ADMIN");
}

/** Which roles a given role is allowed to assign to others. */
export function assignableRoles(role: Role): Role[] {
  if (role === "OWNER") return ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"];
  if (role === "ADMIN") return ["ADMIN", "MANAGER", "EMPLOYEE"];
  if (role === "MANAGER") return ["EMPLOYEE"];
  return [];
}
