import { z } from "zod";
import { TaskService } from "@trackwise/core";
import { json, optionalDate, parseBody, withActor } from "@/lib/api";

export const GET = withActor(async (_req, actor, params) => json({ task: await TaskService.get(actor, params.id) }));
export const PATCH = withActor(async (req, actor, params) => {
  const body = await parseBody(req, z.object({ title: z.string().min(1).optional(), description: z.string().nullable().optional(), dueAt: z.any().optional().transform((v) => (v === undefined ? undefined : optionalDate(v))), estimatedMinutes: z.number().int().nullable().optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(), billable: z.boolean().optional(), status: z.enum(["CANCELLED"]).optional() }));
  if (body.status === "CANCELLED") {
    await TaskService.cancel(actor, params.id);
    return json({ ok: true });
  }
  const { status, ...rest } = body;
  void status;
  return json({ task: await TaskService.update(actor, params.id, rest) });
});
