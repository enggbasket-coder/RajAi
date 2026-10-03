import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@trackwise/shared";
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
