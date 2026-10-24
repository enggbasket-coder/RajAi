/**
 * TimerService — server-authoritative timers and time entries.
 * Exactly one active timer per user is enforced by a unique constraint on active_timers.user_id
 * and by running start/stop/switch inside a transaction with a row lock.
 */
import { prisma, type Db, type Prisma, type TimeSource } from "@trackwise/database";
import { forbidden, invalidState, notFound, validation, type Role } from "@trackwise/shared";
import { isManagerial } from "@trackwise/rbac";

export interface TimerActor {
  userId: string;
  organizationId: string;
  role: Role;
}

async function audit(db: Db, organizationId: string, actorUserId: string | null, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  await db.auditLog.create({ data: { organizationId, actorUserId, action, entityType, entityId, metadataJson: metadata as Prisma.InputJsonValue } });
}

/** Lock the per-user timer slot for the duration of a transaction. */
async function lockUser(tx: Db, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"timer:" + userId}))`;
}

async function closeActiveTimer(tx: Db, organizationId: string, userId: string, reason: string, now: Date) {
  const active = await tx.activeTimer.findUnique({ where: { userId } });
  if (!active || active.organizationId !== organizationId) return null;
  const durationSeconds = Math.max(0, Math.round((now.getTime() - active.startedAt.getTime()) / 1000));
  const task = await tx.task.findUnique({ where: { id: active.taskId } });
  const entry = await tx.timeEntry.create({
    data: {
      organizationId,
      userId,
      projectId: active.projectId,
      taskId: active.taskId,
      startedAt: active.startedAt,
      stoppedAt: now,
      durationSeconds,
      source: active.source,
      billable: task?.billable ?? true,
      status: "RECORDED",
    },
  });
  await tx.activeTimer.delete({ where: { id: active.id } });
  await audit(tx, organizationId, userId, "timer.stopped", "TimeEntry", entry.id, { taskId: active.taskId, durationSeconds, reason });
  return entry;
}

export const TimerService = {
  async current(actor: TimerActor) {
    const t = await prisma.activeTimer.findUnique({ where: { userId: actor.userId }, include: { task: true, project: { include: { client: true } } } });
    if (!t || t.organizationId !== actor.organizationId) return null;
    return { ...t, elapsedSeconds: Math.max(0, Math.round((Date.now() - t.startedAt.getTime()) / 1000)) };
  },

  /** Start (or switch to) a task. Transactionally stops any running timer first. */
  async start(actor: TimerActor, taskId: string, source: TimeSource = "WEB") {
    return prisma.$transaction(async (tx) => {
      await lockUser(tx, actor.userId);
      const task = await tx.task.findFirst({ where: { id: taskId, organizationId: actor.organizationId }, include: { assignments: { where: { userId: actor.userId } } } });
      if (!task) throw notFound("Task");
      if (task.status === "COMPLETED" || task.status === "CANCELLED") throw invalidState("This task is closed");
      const mine = task.assignments[0];
      if (!isManagerial(actor.role)) {
        if (!mine || mine.status !== "ACCEPTED") throw forbidden("Accept the task before starting a timer on it");
      }
      const now = new Date();
      const existing = await tx.activeTimer.findUnique({ where: { userId: actor.userId } });
      if (existing && existing.taskId === taskId && existing.organizationId === actor.organizationId) {
        return { timer: existing, stoppedEntry: null, switched: false };
      }
      const stoppedEntry = existing ? await closeActiveTimer(tx, actor.organizationId, actor.userId, "switch", now) : null;
      const timer = await tx.activeTimer.create({
        data: { organizationId: actor.organizationId, userId: actor.userId, taskId, projectId: task.projectId, startedAt: now, source },
      });
      if (task.status === "ACCEPTED" || task.status === "ASSIGNED") {
        await tx.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
      }
      await audit(tx, actor.organizationId, actor.userId, "timer.started", "ActiveTimer", timer.id, { taskId, source, switchedFrom: existing?.taskId ?? null });
      return { timer, stoppedEntry, switched: !!existing };
    });
  },

  async stop(actor: TimerActor, opts: { discardIdleSeconds?: number } = {}) {
    return prisma.$transaction(async (tx) => {
      await lockUser(tx, actor.userId);
      const active = await tx.activeTimer.findUnique({ where: { userId: actor.userId } });
      if (!active || active.organizationId !== actor.organizationId) throw invalidState("No timer is running");
      let now = new Date();
      // Idle handling: the client may ask to discard the trailing idle period (never automatic).
      if (opts.discardIdleSeconds && opts.discardIdleSeconds > 0) {
        const candidate = new Date(now.getTime() - opts.discardIdleSeconds * 1000);
        if (candidate > active.startedAt) now = candidate;
      }
      const entry = await closeActiveTimer(tx, actor.organizationId, actor.userId, opts.discardIdleSeconds ? "stop_discard_idle" : "stop", now);
      return entry!;
    });
  },

  /** Used by system actions (task completion) — stops a user's timer in this organization if any. */
  async stopForUser(organizationId: string, userId: string, reason: string) {
    return prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      return closeActiveTimer(tx, organizationId, userId, reason, new Date());
    });
  },

  async switchTask(actor: TimerActor, taskId: string, source: TimeSource = "WEB") {
    return this.start(actor, taskId, source);
  },

  async heartbeat(actor: TimerActor) {
    const now = new Date();
    await prisma.organizationMember.updateMany({ where: { organizationId: actor.organizationId, userId: actor.userId }, data: { lastSeenAt: now } });
    await prisma.activeTimer.updateMany({ where: { userId: actor.userId, organizationId: actor.organizationId }, data: { lastHeartbeatAt: now } });
    return now;
  },

  async addManual(actor: TimerActor, input: { projectId: string; taskId?: string | null; startedAt: Date; stoppedAt: Date; reason: string; billable?: boolean }) {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
    if (!org.manualTimeEnabled) throw forbidden("Manual time is disabled for this organization");
    if (!input.reason?.trim()) throw validation("A reason is required for manual time");
    if (!(input.stoppedAt > input.startedAt)) throw validation("End must be after start");
    const durationSeconds = Math.round((input.stoppedAt.getTime() - input.startedAt.getTime()) / 1000);
    if (durationSeconds > 24 * 3600) throw validation("A single entry cannot exceed 24 hours");
    const project = await prisma.project.findFirst({ where: { id: input.projectId, organizationId: actor.organizationId } });
    if (!project) throw validation("Project not found");
    if (input.taskId) {
      const task = await prisma.task.findFirst({ where: { id: input.taskId, organizationId: actor.organizationId, projectId: project.id } });
      if (!task) throw validation("Task not found in that project");
    }
    const overlap = await prisma.timeEntry.findFirst({
      where: { organizationId: actor.organizationId, userId: actor.userId, startedAt: { lt: input.stoppedAt }, stoppedAt: { gt: input.startedAt } },
    });
    if (overlap) throw validation("This overlaps an existing time entry");
    const entry = await prisma.timeEntry.create({
      data: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        projectId: project.id,
        taskId: input.taskId ?? null,
        startedAt: input.startedAt,
        stoppedAt: input.stoppedAt,
        durationSeconds,
        source: "MANUAL",
        manual: true,
        manualReason: input.reason.trim(),
        billable: input.billable ?? project.billable,
      },
    });
    await audit(prisma, actor.organizationId, actor.userId, "manual_time.created", "TimeEntry", entry.id, { durationSeconds, reason: input.reason });
    return entry;
  },

  async listEntries(actor: TimerActor, filter: { userId?: string; from?: Date; to?: Date; projectId?: string; status?: string }) {
    const userId = isManagerial(actor.role) ? filter.userId : actor.userId;
    return prisma.timeEntry.findMany({
      where: {
        organizationId: actor.organizationId,
        ...(userId ? { userId } : {}),
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.status ? { status: filter.status as never } : {}),
        ...(filter.from || filter.to ? { startedAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lt: filter.to } : {}) } } : {}),
      },
      include: { project: { include: { client: true } }, task: true },
      orderBy: { startedAt: "desc" },
    });
  },

  async getEntry(actor: TimerActor, id: string) {
    const e = await prisma.timeEntry.findFirst({ where: { id, organizationId: actor.organizationId } });
    if (!e) throw notFound("Time entry");
    if (e.userId !== actor.userId && !isManagerial(actor.role)) throw notFound("Time entry");
    return e;
  },

  async updateEntry(actor: TimerActor, id: string, input: Partial<{ startedAt: Date; stoppedAt: Date; taskId: string | null; projectId: string; billable: boolean; manualReason: string }>) {
    const e = await this.getEntry(actor, id);
    if (e.status === "APPROVED" || e.status === "SUBMITTED") throw invalidState("Submitted or approved entries are locked");
    const startedAt = input.startedAt ?? e.startedAt;
    const stoppedAt = input.stoppedAt ?? e.stoppedAt;
    if (!(stoppedAt > startedAt)) throw validation("End must be after start");
    if (e.manual && input.manualReason !== undefined && !input.manualReason.trim()) throw validation("Reason is required");
    const updated = await prisma.timeEntry.update({
      where: { id },
      data: { ...input, startedAt, stoppedAt, durationSeconds: Math.round((stoppedAt.getTime() - startedAt.getTime()) / 1000), status: "RECORDED" },
    });
    await audit(prisma, actor.organizationId, actor.userId, e.manual ? "manual_time.edited" : "time.edited", "TimeEntry", id, { changed: Object.keys(input), before: { startedAt: e.startedAt, stoppedAt: e.stoppedAt } });
    return updated;
  },

  async deleteEntry(actor: TimerActor, id: string) {
    const e = await this.getEntry(actor, id);
    if (e.status === "APPROVED" || e.status === "SUBMITTED") throw invalidState("Submitted or approved entries are locked");
    await prisma.timeEntry.delete({ where: { id } });
    await audit(prisma, actor.organizationId, actor.userId, "time.deleted", "TimeEntry", id, { durationSeconds: e.durationSeconds, taskId: e.taskId });
  },
};
