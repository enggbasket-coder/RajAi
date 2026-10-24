import { z } from "zod";
import { MemberService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const GET = withActor(async (_req, actor, params) => {
  const m = await MemberService.get(actor, params.id);
  return json({ member: { userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, active: m.active, displayName: m.displayName, preferredAssignmentChannel: m.preferredAssignmentChannel } });
});

export const PATCH = withActor(async (req, actor, params) => {
  const body = await parseBody(req, z.object({ role: z.enum(["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"]).optional(), active: z.boolean().optional(), displayName: z.string().nullable().optional(), managerUserId: z.string().nullable().optional(), preferredAssignmentChannel: z.enum(["WHATSAPP", "TELEGRAM", "BOTH", "DEFAULT"]).optional() }));
  const { role, ...rest } = body;
  if (role) await MemberService.updateRole(actor, params.id, role);
  if (Object.keys(rest).length) await MemberService.update(actor, params.id, rest);
  return json({ ok: true });
});
