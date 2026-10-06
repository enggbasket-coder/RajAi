import { z } from "zod";
import { TaskService, createAndAssignTask } from "@trackwise/core";
import { dateInTz, json, orgTimeZone, parseBody, withActor } from "@/lib/api";

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  dueAt: z.any().optional(),
  estimatedMinutes: z.number().int().nullable().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  billable: z.boolean().optional(),
  assigneeUserIds: z.array(z.string()).default([]),
  sendVia: z.enum(["PREFERENCE", "WHATSAPP", "TELEGRAM", "BOTH", "WEB"]).default("PREFERENCE"),
  intent: z.enum(["assign", "draft"]).default("assign"),
});

export const GET = withActor(async (req, actor) => {
  const q = req.nextUrl.searchParams;
  return json({ tasks: await TaskService.list(actor, { status: (q.get("status") as never) ?? undefined, projectId: q.get("projectId") ?? undefined, assigneeUserId: q.get("assigneeUserId") ?? undefined, mine: q.get("mine") === "1" }) });
});

export const POST = withActor(async (req, actor) => {
  const body = await parseBody(req, createSchema);
  const tz = await orgTimeZone(actor.organizationId);
  const { task, sends } = await createAndAssignTask(actor, { ...body, dueAt: dateInTz(body.dueAt, tz), draft: body.intent === "draft" });
  return json({ task, sends }, { status: 201 });
});
