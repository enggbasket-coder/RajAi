import { prisma } from "@trackwise/database";
import type { SendVia, TaskPriority } from "@trackwise/shared";
import type { Actor } from "./context";
import { AssignmentService, TaskService, type TaskInput } from "./tasks";
import { MessagingService, type SendResult } from "./messaging/service";

export interface CreateAndAssignInput extends TaskInput {
  assigneeUserIds: string[];
  sendVia?: SendVia;
  priority?: TaskPriority;
  /** Save as draft without assigning or sending. */
  draft?: boolean;
  retryDelaysMs?: number[];
}

/**
 * The primary workflow: create task → assign → deliver.
 * 1-4 run in one transaction; delivery runs afterwards so a provider outage never loses the task.
 */
export async function createAndAssignTask(actor: Actor, input: CreateAndAssignInput) {
  const task = await prisma.$transaction(async (tx) => {
    const task = await TaskService.create(actor, { ...input, status: input.draft || input.assigneeUserIds.length === 0 ? "DRAFT" : "ASSIGNED" }, tx);
    if (!input.draft && input.assigneeUserIds.length > 0) {
      await AssignmentService.assign(actor, task.id, input.assigneeUserIds, input.sendVia ?? "PREFERENCE", tx);
    }
    return task;
  });
  const sends: SendResult[] = [];
  if (!input.draft) {
    const assignments = await prisma.taskAssignment.findMany({ where: { taskId: task.id, status: "PENDING" } });
    for (const a of assignments) sends.push(await MessagingService.sendAssignment(a.id, { sendVia: input.sendVia ?? "PREFERENCE", actorUserId: actor.userId, retryDelaysMs: input.retryDelaysMs }));
  }
  return { task, sends };
}

/** Assign additional users to an existing task and deliver. */
export async function assignExistingTask(actor: Actor, taskId: string, assigneeUserIds: string[], sendVia: SendVia = "PREFERENCE", retryDelaysMs?: number[]) {
  const assignments = await AssignmentService.assign(actor, taskId, assigneeUserIds, sendVia);
  const sends: SendResult[] = [];
  for (const a of assignments) {
    if (a.status !== "PENDING") continue;
    sends.push(await MessagingService.sendAssignment(a.id, { sendVia, actorUserId: actor.userId, retryDelaysMs }));
  }
  return { assignments, sends };
}
