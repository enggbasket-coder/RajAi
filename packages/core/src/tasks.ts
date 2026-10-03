import { prisma, type AssignmentStatus, type Db, type TaskPriority, type TaskStatus } from "@trackwise/database";
import { forbidden, invalidState, notFound, validation, type SendVia } from "@trackwise/shared";
import { isManagerial } from "@trackwise/rbac";
import { AuditService } from "./audit";
import { requirePermission, type Actor } from "./context";

export interface TaskInput {
  projectId: string;
  title: string;
  description?: string | null;
  dueAt?: Date | null;
  estimatedMinutes?: number | null;
  priority?: TaskPriority;
  billable?: boolean;
  status?: "DRAFT" | "ASSIGNED";
}

export const taskInclude = {
  project: { include: { client: true } },
  assignments: { include: { deliveries: true }, orderBy: { createdAt: "asc" as const } },
};

export const TaskService = {
  async list(actor: Actor, filter: { status?: TaskStatus; projectId?: string; assigneeUserId?: string; mine?: boolean } = {}) {
    requirePermission(actor, "tasks:read");
    const where: Record<string, unknown> = { organizationId: actor.organizationId };
    if (filter.status) where.status = filter.status;
    if (filter.projectId) where.projectId = filter.projectId;
    // Employees only ever see tasks assigned to them.
    const assignee = !isManagerial(actor.role) || filter.mine ? actor.userId : filter.assigneeUserId;
    if (assignee) where.assignments = { some: { userId: assignee, status: { not: "CANCELLED" } } };
    return prisma.task.findMany({ where, include: taskInclude, orderBy: [{ createdAt: "desc" }] });
  },

  async get(actor: Actor, id: string) {
    requirePermission(actor, "tasks:read");
    const task = await prisma.task.findFirst({ where: { id, organizationId: actor.organizationId }, include: taskInclude });
    if (!task) throw notFound("Task");
    if (!isManagerial(actor.role) && !task.assignments.some((a) => a.userId === actor.userId)) throw notFound("Task");
    return task;
  },

  async create(actor: Actor, input: TaskInput, db: Db = prisma) {
    requirePermission(actor, "tasks:create");
    if (!input.title?.trim()) throw validation("Task title is required");
    const project = await db.project.findFirst({ where: { id: input.projectId, organizationId: actor.organizationId, archived: false } });
    if (!project) throw validation("Project not found in this organization");
    const task = await db.task.create({
      data: {
        organizationId: actor.organizationId,
        projectId: project.id,
        createdByUserId: actor.userId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        dueAt: input.dueAt ?? null,
        estimatedMinutes: input.estimatedMinutes ?? null,
        priority: input.priority ?? "NORMAL",
        billable: input.billable ?? project.billable,
        status: input.status ?? "DRAFT",
      },
    });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "task.created", entityType: "Task", entityId: task.id, metadata: { title: task.title, projectId: project.id } }, db);
    return task;
  },

  async update(actor: Actor, id: string, input: Partial<TaskInput> & { status?: TaskStatus }) {
    requirePermission(actor, "tasks:create");
    const task = await this.get(actor, id);
    if (task.status === "COMPLETED" || task.status === "CANCELLED") throw invalidState("Completed or cancelled tasks cannot be edited");
    const updated = await prisma.task.update({ where: { id }, data: { ...input, title: input.title?.trim() } });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "task.updated", entityType: "Task", entityId: id, metadata: { changed: Object.keys(input) } });
    return updated;
  },

  async complete(actor: Actor, id: string) {
    requirePermission(actor, "tasks:complete");
    const task = await this.get(actor, id);
    if (task.status === "COMPLETED") return task;
    if (task.status === "CANCELLED") throw invalidState("Cancelled tasks cannot be completed");
    // Stop any running timer on this task first (server-side, transactional).
    const { TimerService } = await import("@trackwise/timer");
    const running = await prisma.activeTimer.findMany({ where: { taskId: id, organizationId: actor.organizationId } });
    for (const t of running) await TimerService.stopForUser(actor.organizationId, t.userId, "task_completed");
    const updated = await prisma.task.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date(), completedByUserId: actor.userId } });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "task.completed", entityType: "Task", entityId: id });
    return updated;
  },

  async cancel(actor: Actor, id: string) {
    requirePermission(actor, "tasks:create");
    await this.get(actor, id);
    await prisma.$transaction([
      prisma.task.update({ where: { id }, data: { status: "CANCELLED" } }),
      prisma.taskAssignment.updateMany({ where: { taskId: id, status: "PENDING" }, data: { status: "CANCELLED" } }),
    ]);
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "task.cancelled", entityType: "Task", entityId: id });
  },

  /** Recompute task status from its assignments (idempotent). */
  async syncStatus(taskId: string, db: Db = prisma) {
    const task = await db.task.findUnique({ where: { id: taskId }, include: { assignments: true } });
    if (!task || task.status === "COMPLETED" || task.status === "CANCELLED" || task.status === "IN_PROGRESS") return;
    const live = task.assignments.filter((a) => a.status !== "CANCELLED");
    let status: TaskStatus = task.status;
    if (live.length === 0) status = "DRAFT";
    else if (live.some((a) => a.status === "ACCEPTED")) status = "ACCEPTED";
    else status = "ASSIGNED";
    if (status !== task.status) await db.task.update({ where: { id: taskId }, data: { status } });
  },
};

export interface RespondInput {
  organizationId: string;
  assignmentId: string;
  /** The employee responding. Must own the assignment. */
  userId: string;
  action: "ACCEPT" | "REJECT";
  reason?: string | null;
  via: "WEB" | "WHATSAPP" | "TELEGRAM";
}

export type RespondResult =
  | { outcome: "ACCEPTED" | "REJECTED"; changed: true; assignment: AssignmentWithTask }
  | { outcome: "ALREADY_ACCEPTED" | "ALREADY_REJECTED" | "CANCELLED"; changed: false; assignment: AssignmentWithTask };

export type AssignmentWithTask = NonNullable<Awaited<ReturnType<typeof loadAssignment>>>;

function loadAssignment(id: string, organizationId: string, db: Db = prisma) {
  return db.taskAssignment.findFirst({ where: { id, organizationId }, include: { task: { include: { project: { include: { client: true } } } }, deliveries: true } });
}

export const AssignmentService = {
  load: loadAssignment,

  /** Create assignments for users (skips already-assigned users). Does not send messages. */
  async assign(actor: Actor, taskId: string, userIds: string[], preferredChannel: SendVia = "PREFERENCE", db: Db = prisma) {
    requirePermission(actor, "tasks:assign");
    const task = await db.task.findFirst({ where: { id: taskId, organizationId: actor.organizationId } });
    if (!task) throw notFound("Task");
    if (task.status === "COMPLETED" || task.status === "CANCELLED") throw invalidState("Task is closed");
    const unique = [...new Set(userIds)];
    if (unique.length === 0) throw validation("Select at least one assignee");
    const members = await db.organizationMember.findMany({ where: { organizationId: actor.organizationId, userId: { in: unique }, active: true } });
    if (members.length !== unique.length) throw forbidden("All assignees must be active members of this organization");
    const created = [];
    for (const userId of unique) {
      const existing = await db.taskAssignment.findUnique({ where: { taskId_userId: { taskId, userId } } });
      if (existing && existing.status !== "CANCELLED") {
        created.push(existing);
        continue;
      }
      const pref = preferredChannel === "PREFERENCE" ? "DEFAULT" : preferredChannel === "WEB" ? "DEFAULT" : preferredChannel;
      const a = existing
        ? await db.taskAssignment.update({ where: { id: existing.id }, data: { status: "PENDING", assignedByUserId: actor.userId, assignedAt: new Date(), respondedAt: null, rejectionReason: null, invalidReplyPromptedAt: null, preferredChannel: pref } })
        : await db.taskAssignment.create({ data: { organizationId: actor.organizationId, taskId, userId, assignedByUserId: actor.userId, preferredChannel: pref } });
      await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "task.assigned", entityType: "TaskAssignment", entityId: a.id, metadata: { taskId, userId } }, db);
      created.push(a);
    }
    if (task.status === "DRAFT") await db.task.update({ where: { id: taskId }, data: { status: "ASSIGNED" } });
    return created;
  },

  /**
   * Accept/reject an assignment. Idempotent: a second accept/reject is a no-op reported via `changed: false`.
   * Authorization: the responding user must be the assignee and the assignment must belong to the organization.
   */
  async respond(input: RespondInput): Promise<RespondResult> {
    return prisma.$transaction(async (tx) => {
      // Row lock so two concurrent webhooks cannot both transition the assignment.
      await tx.$executeRaw`SELECT id FROM task_assignments WHERE id = ${input.assignmentId} FOR UPDATE`;
      const a = await loadAssignment(input.assignmentId, input.organizationId, tx);
      if (!a) throw notFound("Assignment");
      if (a.userId !== input.userId) throw forbidden("This task is not assigned to you");
      if (a.status === "ACCEPTED") return { outcome: "ALREADY_ACCEPTED", changed: false, assignment: a };
      if (a.status === "REJECTED") return { outcome: "ALREADY_REJECTED", changed: false, assignment: a };
      if (a.status === "CANCELLED") return { outcome: "CANCELLED", changed: false, assignment: a };
      const status: AssignmentStatus = input.action === "ACCEPT" ? "ACCEPTED" : "REJECTED";
      await tx.taskAssignment.update({
        where: { id: a.id },
        data: { status, respondedAt: new Date(), rejectionReason: input.action === "REJECT" ? (input.reason?.trim() || null) : null },
      });
      await TaskService.syncStatus(a.taskId, tx);
      await AuditService.log(
        {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: input.action === "ACCEPT" ? "task.accepted" : "task.rejected",
          entityType: "TaskAssignment",
          entityId: a.id,
          metadata: { taskId: a.taskId, via: input.via, reason: input.reason ?? undefined },
        },
        tx,
      );
      const fresh = (await loadAssignment(a.id, input.organizationId, tx))!;
      return { outcome: status, changed: true, assignment: fresh };
    });
  },

  async respondAsActor(actor: Actor, assignmentId: string, action: "ACCEPT" | "REJECT", reason?: string | null) {
    if (action === "REJECT" && !reason?.trim()) throw validation("Please give a short reason for rejecting this task");
    return this.respond({ organizationId: actor.organizationId, assignmentId, userId: actor.userId, action, reason, via: "WEB" });
  },

  async cancel(actor: Actor, assignmentId: string) {
    requirePermission(actor, "tasks:assign");
    const a = await loadAssignment(assignmentId, actor.organizationId);
    if (!a) throw notFound("Assignment");
    if (a.status !== "PENDING") throw invalidState("Only pending assignments can be cancelled");
    await prisma.taskAssignment.update({ where: { id: a.id }, data: { status: "CANCELLED" } });
    await TaskService.syncStatus(a.taskId);
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "assignment.cancelled", entityType: "TaskAssignment", entityId: a.id });
  },

  /** Assignments for the "My Tasks" view. */
  listForUser(organizationId: string, userId: string) {
    return prisma.taskAssignment.findMany({
      where: { organizationId, userId, status: { not: "CANCELLED" }, task: { status: { notIn: ["CANCELLED"] } } },
      include: { task: { include: { project: { include: { client: true } } } }, deliveries: true },
      orderBy: [{ status: "asc" }, { assignedAt: "desc" }],
    });
  },
};
