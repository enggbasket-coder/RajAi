import { prisma, type Role as DbRole } from "@trackwise/database";
import { AppError, hashPassword, randomToken, sha256Hex, unauthenticated, verifyPassword, type Role } from "@trackwise/shared";

export const SESSION_COOKIE = "tw_session";
export const SESSION_TTL_DAYS = 30;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  timezone: string | null;
}

export interface Membership {
  id: string;
  organizationId: string;
  role: Role;
  active: boolean;
  displayName: string | null;
  preferredAssignmentChannel: "WHATSAPP" | "TELEGRAM" | "BOTH" | "DEFAULT";
  managerUserId: string | null;
}

/** The authenticated actor for a request: user + the organization membership in use. */
export interface Actor {
  user: AuthUser;
  membership: Membership;
  organizationId: string;
  role: Role;
  userId: string;
}

export async function registerUser(input: { email: string; password: string; name: string; timezone?: string }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError("VALIDATION", "Invalid email address");
  if (input.password.length < 8) throw new AppError("VALIDATION", "Password must be at least 8 characters");
  if (!input.name.trim()) throw new AppError("VALIDATION", "Name is required");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError("CONFLICT", "An account with that email already exists");
  return prisma.user.create({
    data: { email, name: input.name.trim(), passwordHash: hashPassword(input.password), timezone: input.timezone ?? null },
  });
}

export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !verifyPassword(password, user.passwordHash)) throw unauthenticated("Invalid email or password");
  return user;
}

export async function createSession(userId: string, client: "web" | "desktop" = "web") {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000);
  await prisma.session.create({ data: { userId, tokenHash: sha256Hex(token), client, expiresAt } });
  return { token, expiresAt };
}

export async function revokeSession(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: sha256Hex(token) } });
}

export async function getUserBySessionToken(token: string | undefined | null): Promise<AuthUser | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  const { user } = session;
  return { id: user.id, email: user.email, name: user.name, timezone: user.timezone };
}

export async function listMemberships(userId: string) {
  return prisma.organizationMember.findMany({
    where: { userId, active: true },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Resolve the actor for a user in an organization. Membership is always loaded
 * from the database: the browser never gets to claim an organization or role.
 */
export async function resolveActor(user: AuthUser, organizationId: string | null | undefined): Promise<Actor | null> {
  const membership = organizationId
    ? await prisma.organizationMember.findFirst({ where: { userId: user.id, organizationId, active: true } })
    : await prisma.organizationMember.findFirst({ where: { userId: user.id, active: true }, orderBy: { createdAt: "asc" } });
  if (!membership) return null;
  return {
    user,
    userId: user.id,
    organizationId: membership.organizationId,
    role: membership.role as Role,
    membership: {
      id: membership.id,
      organizationId: membership.organizationId,
      role: membership.role as Role,
      active: membership.active,
      displayName: membership.displayName,
      preferredAssignmentChannel: membership.preferredAssignmentChannel,
      managerUserId: membership.managerUserId,
    },
  };
}

export async function createPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return null; // do not reveal whether the account exists
  const token = randomToken(32);
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + 3600_000) },
  });
  return { token, user };
}

export async function resetPassword(token: string, newPassword: string) {
  if (newPassword.length < 8) throw new AppError("VALIDATION", "Password must be at least 8 characters");
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256Hex(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new AppError("VALIDATION", "Reset link is invalid or expired");
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash: hashPassword(newPassword) } }),
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: row.userId } }),
  ]);
  return row.userId;
}

export async function updateProfile(userId: string, input: { name?: string; timezone?: string | null }) {
  if (input.name !== undefined && !input.name.trim()) throw new AppError("VALIDATION", "Name is required");
  return prisma.user.update({ where: { id: userId }, data: { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.timezone !== undefined ? { timezone: input.timezone || null } : {}) } });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  if (newPassword.length < 8) throw new AppError("VALIDATION", "New password must be at least 8 characters");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!verifyPassword(currentPassword, user.passwordHash)) throw new AppError("VALIDATION", "Current password is incorrect");
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(newPassword) } });
}

export type { DbRole };
