import { z } from "zod";
import { changePassword } from "@trackwise/auth";
import { json, parseBody, withUser } from "@/lib/api";

export const POST = withUser(async (req, user) => {
  const { currentPassword, newPassword } = await parseBody(req, z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }));
  await changePassword(user.id, currentPassword, newPassword);
  return json({ ok: true });
});
