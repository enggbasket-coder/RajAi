import { InvitationService } from "@trackwise/core";
import { json, withPublic } from "@/lib/api";

export const GET = withPublic(async (_req, params) => {
  const inv = await InvitationService.getByToken(params.token);
  if (!inv) return json({ error: "Invitation is invalid or expired" }, { status: 404 });
  return json({ invitation: inv });
});
