import { z } from "zod";
import { resetPassword } from "@trackwise/auth";
import { json, parseBody, withPublic } from "@/lib/api";

export const POST = withPublic(async (req) => {
  const { token, password } = await parseBody(req, z.object({ token: z.string().min(1), password: z.string().min(8) }));
  await resetPassword(token, password);
  return json({ ok: true });
});
