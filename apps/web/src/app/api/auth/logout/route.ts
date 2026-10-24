import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { revokeSession, SESSION_COOKIE } from "@trackwise/auth";
import { ORG_COOKIE } from "@/lib/session";

async function logout(req: NextRequest) {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  const next = req.nextUrl.searchParams.get("next") || "/login";
  const res = req.method === "GET" ? NextResponse.redirect(new URL(next, req.url)) : NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  res.cookies.set(ORG_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
export const POST = logout;
export const GET = logout;
