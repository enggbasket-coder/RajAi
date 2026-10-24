import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@trackwise/database";
import { AssignmentService, ClientService, ProjectService, TaskService, TimerService, TimesheetService, ReportService, createAndAssignTask } from "../src";
import { NO_RETRY, createFixture, resetDb } from "./helpers";

beforeAll(async () => {
  await resetDb();
});

describe("Tenant isolation", () => {
  it("Organization A cannot read or write Organization B data", async () => {
    const a = await createFixture();
    const b = await createFixture();
    const { task } = await createAndAssignTask(b.manager, { projectId: b.project.id, title: "B task", assigneeUserIds: [b.employee.userId], sendVia: "WEB", retryDelaysMs: NO_RETRY });
    await expect(TaskService.get(a.owner, task.id)).rejects.toThrow(/not found/i);
    await expect(ProjectService.get(a.owner, b.project.id)).rejects.toThrow(/not found/i);
    await expect(ClientService.get(a.owner, b.client.id)).rejects.toThrow(/not found/i);
    await expect(TaskService.update(a.owner, task.id, { title: "pwned" })).rejects.toThrow(/not found/i);
    // cannot assign B's member from A, nor A's member to B's task
    await expect(AssignmentService.assign(a.manager, task.id, [a.employee.userId])).rejects.toThrow(/not found/i);
    await expect(createAndAssignTask(a.manager, { projectId: a.project.id, title: "x", assigneeUserIds: [b.employee.userId], sendVia: "WEB" })).rejects.toThrow(/active members/i);
    await expect(createAndAssignTask(a.manager, { projectId: b.project.id, title: "x", assigneeUserIds: [a.employee.userId], sendVia: "WEB" })).rejects.toThrow(/Project not found/i);
    // B's employee cannot respond to a task through A's actor
    const assignment = await prisma.taskAssignment.findFirstOrThrow({ where: { taskId: task.id } });
    await expect(AssignmentService.respondAsActor(a.employee, assignment.id, "ACCEPT")).rejects.toThrow(/not found/i);
    // lists are scoped
    expect((await TaskService.list(a.owner)).length).toBe(0);
    expect((await ClientService.list(a.owner)).map((c) => c.id)).not.toContain(b.client.id);
    // timer on another org's task
    await expect(TimerService.start(a.owner, task.id)).rejects.toThrow(/not found/i);
    // audit log scoped
    expect(await prisma.auditLog.count({ where: { organizationId: a.org.id, entityId: task.id } })).toBe(0);
  });

  it("employees only see tasks assigned to them", async () => {
    const f = await createFixture();
    const { task } = await createAndAssignTask(f.manager, { projectId: f.project.id, title: "Only for Priya", assigneeUserIds: [f.employee2.userId], sendVia: "WEB" });
    await expect(TaskService.get(f.employee, task.id)).rejects.toThrow(/not found/i);
    expect((await TaskService.list(f.employee)).length).toBe(0);
    expect((await TaskService.list(f.employee2)).length).toBe(1);
  });
});

describe("Timer", () => {
  it("starting a second task stops the first transactionally with no overlap", async () => {
    const f = await createFixture();
    const t1 = await createAndAssignTask(f.manager, { projectId: f.project.id, title: "T1", assigneeUserIds: [f.employee.userId], sendVia: "WEB" });
    const t2 = await createAndAssignTask(f.manager, { projectId: f.project.id, title: "T2", assigneeUserIds: [f.employee.userId], sendVia: "WEB" });
    const a1 = await prisma.taskAssignment.findFirstOrThrow({ where: { taskId: t1.task.id } });
    // must accept first
    await expect(TimerService.start(f.employee, t1.task.id)).rejects.toThrow(/Accept the task/);
    await AssignmentService.respondAsActor(f.employee, a1.id, "ACCEPT");
    await AssignmentService.respondAsActor(f.employee, (await prisma.taskAssignment.findFirstOrThrow({ where: { taskId: t2.task.id } })).id, "ACCEPT");

    const s1 = await TimerService.start(f.employee, t1.task.id);
    expect(s1.switched).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    const s2 = await TimerService.start(f.employee, t2.task.id);
    expect(s2.switched).toBe(true);
    expect(s2.stoppedEntry?.taskId).toBe(t1.task.id);
    expect(s2.stoppedEntry!.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(await prisma.activeTimer.count({ where: { userId: f.employee.userId } })).toBe(1);
    const current = await TimerService.current(f.employee);
    expect(current?.taskId).toBe(t2.task.id);
    expect(s2.stoppedEntry!.stoppedAt.getTime()).toBeLessThanOrEqual(current!.startedAt.getTime());
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t2.task.id } })).status).toBe("IN_PROGRESS");

    // concurrent starts cannot produce two timers
    await Promise.allSettled([TimerService.start(f.employee, t1.task.id), TimerService.start(f.employee, t2.task.id)]);
    expect(await prisma.activeTimer.count({ where: { userId: f.employee.userId } })).toBe(1);

    const entry = await TimerService.stop(f.employee);
    expect(entry.status).toBe("RECORDED");
    expect(await TimerService.current(f.employee)).toBeNull();
    await expect(TimerService.stop(f.employee)).rejects.toThrow(/No timer/);
  });

  it("manual time requires a reason and org permission, and marks the entry manual", async () => {
    const f = await createFixture();
    const start = new Date(Date.now() - 2 * 3600000);
    const end = new Date(Date.now() - 3600000);
    await expect(TimerService.addManual(f.employee, { projectId: f.project.id, startedAt: start, stoppedAt: end, reason: "" })).rejects.toThrow(/reason/);
    const e = await TimerService.addManual(f.employee, { projectId: f.project.id, startedAt: start, stoppedAt: end, reason: "Forgot timer" });
    expect(e.manual).toBe(true);
    expect(e.source).toBe("MANUAL");
    expect(e.durationSeconds).toBe(3600);
    await prisma.organization.update({ where: { id: f.org.id }, data: { manualTimeEnabled: false } });
    await expect(TimerService.addManual(f.employee, { projectId: f.project.id, startedAt: new Date(Date.now() - 5 * 3600000), stoppedAt: new Date(Date.now() - 4 * 3600000), reason: "x" })).rejects.toThrow(/disabled/);
  });
});

describe("Timesheets", () => {
  it("employee cannot approve own timesheet; manager approves; approved time is locked; reopen audited", async () => {
    const f = await createFixture();
    const start = new Date(Date.now() - 2 * 3600000);
    const e = await TimerService.addManual(f.employee, { projectId: f.project.id, startedAt: start, stoppedAt: new Date(Date.now() - 3600000), reason: "test" });
    const week = await TimesheetService.getWeek(f.employee, f.employee.userId, new Date());
    expect(week.totalSeconds).toBe(3600);
    await expect(TimesheetService.approve(f.manager, week.timesheet.id)).rejects.toThrow(/submitted/);
    await TimesheetService.submit(f.employee, week.timesheet.id);
    await expect(TimesheetService.approve(f.employee, week.timesheet.id)).rejects.toThrow(/permission|own/i);
    await expect(TimesheetService.submit(f.employee2, week.timesheet.id)).rejects.toThrow(/own|not found/i);
    // a manager cannot approve their own either
    const mEntry = await TimerService.addManual(f.manager, { projectId: f.project.id, startedAt: start, stoppedAt: new Date(Date.now() - 3600000), reason: "mgr" });
    const mWeek = await TimesheetService.getWeek(f.manager, f.manager.userId, new Date());
    await TimesheetService.submit(f.manager, mWeek.timesheet.id);
    await expect(TimesheetService.approve(f.manager, mWeek.timesheet.id)).rejects.toThrow(/own timesheet/);
    expect(mEntry.id).toBeTruthy();

    await TimesheetService.approve(f.manager, week.timesheet.id);
    const locked = await prisma.timeEntry.findUniqueOrThrow({ where: { id: e.id } });
    expect(locked.status).toBe("APPROVED");
    await expect(TimerService.updateEntry(f.employee, e.id, { billable: false })).rejects.toThrow(/locked/);
    await expect(TimerService.deleteEntry(f.employee, e.id)).rejects.toThrow(/locked/);
    const report = await ReportService.hours(f.manager, { status: "APPROVED" });
    expect(report.totalSeconds).toBe(3600);
    expect(report.byEmployee[0].label).toBe("Akhil Rao");

    await TimesheetService.reopen(f.manager, week.timesheet.id, "Fix client");
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("RECORDED");
    expect(await prisma.auditLog.count({ where: { organizationId: f.org.id, action: "timesheet.reopened" } })).toBe(1);
    const csv = await ReportService.exportCsv(f.manager, {});
    expect(csv.split("\n")[0]).toContain("Employee");
    expect(csv).toContain("Akhil Rao");
  });
});
