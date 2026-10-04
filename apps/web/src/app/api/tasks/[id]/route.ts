import { z } from "zod";
import { TaskService } from "@trackwise/core";
import { dateInTz, json, orgTimeZone, parseBody, withActor } from "@/lib/api";

export const GET = withActor(async (_req, actor, params) => json({ task: await TaskService.get(actor, params.id) }));
export const PATCH = withActor(async (req, actor, params) => {
  const body = await parseBody(req, z.object({ title: z.string().min(1).optional(), description: z.string().nullable().optional(), dueAt: z.any().optional(), estimatedMinutes: z.number().int().nullable().optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(), billable: z.boolean().optional(), status: z.enum(["CANCELLED"]).optional() }));
  if (body.status === "CANCELLED") {
    await TaskService.cancel(actor, params.id);
    return json({ ok: true });
  }
  const { status, dueAt, ...rest } = body;
  void status;
  const tz = await orgTimeZone(actor.organizationId);
  return json({ task: await TaskService.update(actor, params.id, { ...rest, ...(dueAt === undefined ? {} : { dueAt: dateInTz(dueAt, tz) }) }) });
});
