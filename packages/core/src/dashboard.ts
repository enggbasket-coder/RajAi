import { prisma } from "@trackwise/database";
import { addDays, startOfDayInTz } from "@trackwise/shared";
import { requirePermission, type Actor } from "./context";

export const PRESENCE_TIMEOUT_MS = 90_000;

export const DashboardService = {
  async summary(actor: Actor) {
    requirePermission(actor, "live_team:read");
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
    const dayStart = startOfDayInTz(new Date(), org.timezone);
    const dayEnd = addDays(dayStart, 1);
    const o = { organizationId: actor.organizationId };
    const [trackingNow, hoursToday, tasksToday, accepted, pending, rejected, awaiting, deliveries] = await Promise.all([
      prisma.activeTimer.count({ where: o }),
      prisma.timeEntry.aggregate({ where: { ...o, startedAt: { gte: dayStart, lt: dayEnd } }, _sum: { durationSeconds: true } }),
      prisma.taskAssignment.count({ where: { ...o, assignedAt: { gte: dayStart, lt: dayEnd } } }),
      prisma.taskAssignment.count({ where: { ...o, status: "ACCEPTED" } }),
      prisma.taskAssignment.count({ where: { ...o, status: "PENDING" } }),
      prisma.taskAssignment.count({ where: { ...o, status: "REJECTED" } }),
      prisma.timesheet.count({ where: { ...o, status: "SUBMITTED" } }),
      prisma.assignmentDelivery.groupBy({ by: ["channel", "status"], where: { ...o, channel: { in: ["WHATSAPP", "TELEGRAM"] } }, _count: { _all: true } }),
    ]);
    const running = await prisma.activeTimer.findMany({ where: o });
    const liveSeconds = running.reduce((s, t) => s + Math.max(0, (Date.now() - Math.max(t.startedAt.getTime(), dayStart.getTime())) / 1000), 0);
    const count = (channel: string, statuses: string[]) => deliveries.filter((d) => d.channel === channel && statuses.includes(d.status)).reduce((s, d) => s + d._count._all, 0);
    const messaging = {
      whatsapp: { delivered: count("WHATSAPP", ["DELIVERED", "READ"]), sent: count("WHATSAPP", ["SENT"]), pending: count("WHATSAPP", ["QUEUED"]), failed: count("WHATSAPP", ["FAILED"]) },
      telegram: { delivered: count("TELEGRAM", ["SENT", "DELIVERED", "READ"]), sent: count("TELEGRAM", ["SENT"]), pending: count("TELEGRAM", ["QUEUED"]), failed: count("TELEGRAM", ["FAILED"]) },
    };
    return {
      trackingNow,
      hoursTodaySeconds: (hoursToday._sum.durationSeconds ?? 0) + Math.round(liveSeconds),
      tasksAssignedToday: tasksToday,
      assignmentsAccepted: accepted,
      assignmentsPending: pending,
      assignmentsRejected: rejected,
      timesheetsAwaiting: awaiting,
      messagingFailures: messaging.whatsapp.failed + messaging.telegram.failed,
      messaging,
    };
  },

  async liveTeam(actor: Actor) {
    requirePermission(actor, "live_team:read");
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
    const dayStart = startOfDayInTz(new Date(), org.timezone);
    const members = await prisma.organizationMember.findMany({ where: { organizationId: actor.organizationId, active: true }, include: { user: true } });
    const timers = await prisma.activeTimer.findMany({ where: { organizationId: actor.organizationId }, include: { task: true, project: true } });
    const today = await prisma.timeEntry.groupBy({ by: ["userId"], where: { organizationId: actor.organizationId, startedAt: { gte: dayStart } }, _sum: { durationSeconds: true } });
    const open = await prisma.taskAssignment.groupBy({ by: ["userId"], where: { organizationId: actor.organizationId, status: { in: ["PENDING", "ACCEPTED"] }, task: { status: { notIn: ["COMPLETED", "CANCELLED"] } } }, _count: { _all: true } });
    const now = Date.now();
    return members.map((m) => {
      const t = timers.find((x) => x.userId === m.userId);
      const live = t ? Math.max(0, Math.round((now - t.startedAt.getTime()) / 1000)) : 0;
      return {
        userId: m.userId,
        name: m.displayName || m.user.name,
        role: m.role,
        online: !!m.lastSeenAt && now - m.lastSeenAt.getTime() < PRESENCE_TIMEOUT_MS,
        lastSeenAt: m.lastSeenAt,
        tracking: !!t,
        currentProject: t?.project.name ?? null,
        currentTask: t?.task.title ?? null,
        timerSeconds: live,
        hoursTodaySeconds: (today.find((x) => x.userId === m.userId)?._sum.durationSeconds ?? 0) + live,
        openTasks: open.find((x) => x.userId === m.userId)?._count._all ?? 0,
      };
    });
  },
};
