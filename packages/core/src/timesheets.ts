import { prisma, type TimesheetStatus } from "@trackwise/database";
import { addDays, forbidden, invalidState, localDateKey, notFound, startOfWeekInTz, validation } from "@trackwise/shared";
import { isManagerial } from "@trackwise/rbac";
import { AuditService } from "./audit";
import { requirePermission, type Actor } from "./context";
import { notifyTimesheet } from "./notifications";

async function orgTz(organizationId: string) {
  return (await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } })).timezone;
}

export const TimesheetService = {
  /** Week (Mon–Sun) view for a user; creates the DRAFT timesheet row lazily. */
  async getWeek(actor: Actor, userId: string, anyDayInWeek: Date) {
    if (userId !== actor.userId) requirePermission(actor, "time:read_team");
    const tz = await orgTz(actor.organizationId);
    const weekStart = startOfWeekInTz(anyDayInWeek, tz);
    const weekEnd = addDays(weekStart, 7);
    const timesheet = await prisma.timesheet.upsert({
      where: { organizationId_userId_weekStart: { organizationId: actor.organizationId, userId, weekStart } },
      create: { organizationId: actor.organizationId, userId, weekStart },
      update: {},
    });
    const entries = await prisma.timeEntry.findMany({
      where: { organizationId: actor.organizationId, userId, startedAt: { gte: weekStart, lt: weekEnd } },
      include: { project: { include: { client: true } }, task: true },
      orderBy: { startedAt: "asc" },
    });
    const days = Array.from({ length: 7 }, (_, i) => {
      const dayStart = addDays(weekStart, i);
      const key = localDateKey(dayStart, tz);
      const dayEntries = entries.filter((e) => localDateKey(e.startedAt, tz) === key);
      return { date: dayStart, key, entries: dayEntries, totalSeconds: dayEntries.reduce((s, e) => s + e.durationSeconds, 0) };
    });
    return { timesheet, weekStart, weekEnd, days, totalSeconds: entries.reduce((s, e) => s + e.durationSeconds, 0), billableSeconds: entries.filter((e) => e.billable).reduce((s, e) => s + e.durationSeconds, 0), timezone: tz };
  },

  async getDay(actor: Actor, userId: string, day: Date) {
    const week = await this.getWeek(actor, userId, day);
    const tz = week.timezone;
    const key = localDateKey(day, tz);
    return { ...week, day: week.days.find((d) => d.key === key) ?? week.days[0] };
  },

  async list(actor: Actor, filter: { status?: TimesheetStatus; userId?: string } = {}) {
    const userId = isManagerial(actor.role) ? filter.userId : actor.userId;
    const rows = await prisma.timesheet.findMany({
      where: { organizationId: actor.organizationId, ...(userId ? { userId } : {}), ...(filter.status ? { status: filter.status } : {}) },
      include: { entries: true },
      orderBy: [{ weekStart: "desc" }],
    });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } });
    return rows.map((r) => ({ ...r, userName: users.find((u) => u.id === r.userId)?.name ?? "—", totalSeconds: r.entries.reduce((s, e) => s + e.durationSeconds, 0) }));
  },

  async get(actor: Actor, id: string) {
    const ts = await prisma.timesheet.findFirst({ where: { id, organizationId: actor.organizationId } });
    if (!ts) throw notFound("Timesheet");
    if (ts.userId !== actor.userId && !isManagerial(actor.role)) throw notFound("Timesheet");
    return ts;
  },

  async submit(actor: Actor, id: string) {
    const ts = await this.get(actor, id);
    if (ts.userId !== actor.userId) throw forbidden("Only the employee can submit their own timesheet");
    if (ts.status === "SUBMITTED" || ts.status === "APPROVED") throw invalidState(`Timesheet is already ${ts.status.toLowerCase()}`);
    const weekEnd = addDays(ts.weekStart, 7);
    const result = await prisma.$transaction(async (tx) => {
      const n = await tx.timeEntry.updateMany({
        where: { organizationId: actor.organizationId, userId: ts.userId, startedAt: { gte: ts.weekStart, lt: weekEnd }, status: { in: ["RECORDED", "REJECTED"] } },
        data: { status: "SUBMITTED", timesheetId: ts.id },
      });
      if (n.count === 0) throw validation("There is no time to submit for this week");
      return tx.timesheet.update({ where: { id: ts.id }, data: { status: "SUBMITTED", submittedAt: new Date(), reviewComment: null } });
    });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "timesheet.submitted", entityType: "Timesheet", entityId: ts.id });
    const managers = await prisma.organizationMember.findMany({ where: { organizationId: actor.organizationId, role: { in: ["MANAGER", "ADMIN", "OWNER"] }, active: true } });
    const me = await prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } });
    for (const m of managers.slice(0, 5)) await notifyTimesheet("timesheet_submitted", actor.organizationId, m.userId, `🗓 ${me?.name} submitted a timesheet for the week of ${ts.weekStart.toISOString().slice(0, 10)}.`);
    return result;
  },

  async approve(actor: Actor, id: string) {
    requirePermission(actor, "timesheets:approve");
    const ts = await this.get(actor, id);
    if (ts.userId === actor.userId) throw forbidden("You cannot approve your own timesheet");
    if (ts.status !== "SUBMITTED") throw invalidState("Only submitted timesheets can be approved");
    const result = await prisma.$transaction(async (tx) => {
      await tx.timeEntry.updateMany({ where: { timesheetId: ts.id, status: "SUBMITTED" }, data: { status: "APPROVED" } });
      return tx.timesheet.update({ where: { id: ts.id }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedByUserId: actor.userId } });
    });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "timesheet.approved", entityType: "Timesheet", entityId: ts.id, metadata: { userId: ts.userId } });
    await notifyTimesheet("timesheet_approved", actor.organizationId, ts.userId, `✅ Your timesheet for the week of ${ts.weekStart.toISOString().slice(0, 10)} was approved.`);
    return result;
  },

  async reject(actor: Actor, id: string, comment: string) {
    requirePermission(actor, "timesheets:approve");
    const ts = await this.get(actor, id);
    if (ts.userId === actor.userId) throw forbidden("You cannot review your own timesheet");
    if (ts.status !== "SUBMITTED") throw invalidState("Only submitted timesheets can be rejected");
    if (!comment?.trim()) throw validation("Please add a comment explaining the rejection");
    const result = await prisma.$transaction(async (tx) => {
      await tx.timeEntry.updateMany({ where: { timesheetId: ts.id, status: "SUBMITTED" }, data: { status: "REJECTED" } });
      return tx.timesheet.update({ where: { id: ts.id }, data: { status: "REJECTED", reviewedAt: new Date(), reviewedByUserId: actor.userId, reviewComment: comment.trim() } });
    });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "timesheet.rejected", entityType: "Timesheet", entityId: ts.id, metadata: { comment } });
    await notifyTimesheet("timesheet_rejected", actor.organizationId, ts.userId, `↩️ Your timesheet for the week of ${ts.weekStart.toISOString().slice(0, 10)} was rejected: ${comment.trim()}`);
    return result;
  },

  /** Reopen an approved/submitted timesheet (admin/manager). Always audited. */
  async reopen(actor: Actor, id: string, reason?: string) {
    requirePermission(actor, "timesheets:approve");
    const ts = await this.get(actor, id);
    if (ts.status === "DRAFT") throw invalidState("Timesheet is already open");
    const result = await prisma.$transaction(async (tx) => {
      await tx.timeEntry.updateMany({ where: { timesheetId: ts.id }, data: { status: "RECORDED" } });
      return tx.timesheet.update({ where: { id: ts.id }, data: { status: "DRAFT", reopenedAt: new Date(), reopenedByUserId: actor.userId, reviewComment: reason?.trim() || ts.reviewComment } });
    });
    await AuditService.log({ organizationId: actor.organizationId, actorUserId: actor.userId, action: "timesheet.reopened", entityType: "Timesheet", entityId: ts.id, metadata: { from: ts.status, reason } });
    return result;
  },
};
