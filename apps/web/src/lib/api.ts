import { NextResponse, type NextRequest } from "next/server";
import { AppError, zonedToUtc } from "@trackwise/shared";
import { prisma } from "@trackwise/database";
import type { Actor, AuthUser } from "@trackwise/auth";
import { getCurrentActor, getCurrentUser } from "./session";
import { ZodError, type ZodType } from "zod";

export type Params = Record<string, string>;
type Ctx = { params: Promise<Params> };

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function handleError(e: unknown) {
  if (e instanceof AppError) return json({ error: e.message, code: e.code, details: e.details }, { status: e.status });
  if (e instanceof ZodError) return json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "VALIDATION" }, { status: 400 });
  console.error(e);
  return json({ error: "Internal server error" }, { status: 500 });
}

export function withActor(handler: (req: NextRequest, actor: Actor, params: Params) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      const actor = await getCurrentActor();
      if (!actor) return json({ error: "Not authenticated", code: "UNAUTHENTICATED" }, { status: 401 });
      return await handler(req, actor, await ctx.params);
    } catch (e) {
      return handleError(e);
    }
  };
}

export function withUser(handler: (req: NextRequest, user: AuthUser, params: Params) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      const user = await getCurrentUser();
      if (!user) return json({ error: "Not authenticated", code: "UNAUTHENTICATED" }, { status: 401 });
      return await handler(req, user, await ctx.params);
    } catch (e) {
      return handleError(e);
    }
  };
}

export function withPublic(handler: (req: NextRequest, params: Params) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      return await handler(req, await ctx.params);
    } catch (e) {
      return handleError(e);
    }
  };
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T, any, any>): Promise<T> {
  let raw: unknown = {};
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) raw = await req.json().catch(() => ({}));
  else if (ct.includes("form")) raw = Object.fromEntries((await req.formData()).entries());
  return schema.parse(raw);
}

export const optionalDate = (v: unknown) => (v === "" || v === null || v === undefined ? null : new Date(String(v)));

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Parse a date value from the client. Values from <input type="datetime-local"> carry no offset, so they are
 * interpreted in the organization's timezone; ISO strings with Z/offset are parsed as-is.
 */
export function dateInTz(v: unknown, timeZone: string): Date | null {
  if (v === "" || v === null || v === undefined) return null;
  const str = String(v);
  const m = LOCAL_INPUT.exec(str);
  if (m) return zonedToUtc(timeZone, Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function orgTimeZone(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
  return org?.timezone ?? "UTC";
}
