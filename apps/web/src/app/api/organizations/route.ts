import { z } from "zod";
import { OrganizationService } from "@trackwise/core";
import { json, parseBody, withUser } from "@/lib/api";
import { ORG_COOKIE } from "@/lib/session";

export const POST = withUser(async (req, user) => {
  const body = await parseBody(req, z.object({ name: z.string().min(1), timezone: z.string().default("UTC") }));
  const org = await OrganizationService.create(user.id, body);
  const res = json({ organization: org });
  res.cookies.set(ORG_COOKIE, org.id, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
});
