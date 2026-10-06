import { z } from "zod";
import { InvitationService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const GET = withActor(async (_req, actor) => json({ invitations: await InvitationService.list(actor) }));
export const POST = withActor(async (req, actor) => {
  const body = await parseBody(req, z.object({ email: z.string().email(), role: z.enum(["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"]) }));
  const r = await InvitationService.create(actor, body);
  // No email provider in the MVP: the invite URL is returned to the inviter to share.
  return json({ invitation: { id: r.invitation.id, email: r.invitation.email, role: r.invitation.role, expiresAt: r.invitation.expiresAt }, url: r.url });
});
