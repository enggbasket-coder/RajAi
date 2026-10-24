import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@trackwise/database";
import { buttonData, clickTg, createFixture, lastOutbound, resetDb, sendTg, sendWa } from "./helpers";

beforeAll(async () => {
  await resetDb();
});

describe("Manager assignment via WhatsApp", () => {
  it("parses, confirms with YES and creates + sends the task", async () => {
    const f = await createFixture();
    let s = await sendWa(f, f.phones.manager, "assign Akhil | EdgeVerve Q2O | Finish Act 2 keyframes | due tomorrow 2pm");
    expect(s.outcomes).toContain("AWAITING_ASSIGN_CONFIRMATION");
    const confirm = lastOutbound("WHATSAPP", f.phones.manager)?.message.text ?? "";
    expect(confirm).toContain("Create this task?");
    expect(confirm).toContain("Employee: Akhil Rao");
    expect(confirm).toContain("Project: EdgeVerve Q2O");
    expect(confirm).toContain("Tomorrow at 2:00 pm");
    expect(await prisma.task.count({ where: { organizationId: f.org.id } })).toBe(0);

    s = await sendWa(f, f.phones.manager, "YES");
    expect(s.outcomes).toContain("TASK_CREATED");
    const task = await prisma.task.findFirstOrThrow({ where: { organizationId: f.org.id }, include: { assignments: { include: { deliveries: true } } } });
    expect(task.title).toBe("Finish Act 2 keyframes");
    expect(task.createdByUserId).toBe(f.manager.userId);
    expect(task.assignments[0].userId).toBe(f.employee.userId);
    expect(task.assignments[0].deliveries[0].status).toBe("SENT");
    // employee got it on the org default channel (WhatsApp)
    expect(lastOutbound("WHATSAPP", f.phones.employee)?.message.text).toContain("Finish Act 2 keyframes");
    const dueLocal = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: false }).format(task.dueAt!);
    expect(dueLocal).toBe("14:00");
  });

  it("NO cancels without creating anything", async () => {
    const f = await createFixture();
    await sendWa(f, f.phones.manager, "assign Akhil | EVQ2O | Something | due Friday 5pm");
    const s = await sendWa(f, f.phones.manager, "no");
    expect(s.outcomes).toContain("COMMAND_CANCELLED");
    expect(await prisma.task.count({ where: { organizationId: f.org.id } })).toBe(0);
  });

  it("asks to choose when the employee name is ambiguous and never guesses", async () => {
    const f = await createFixture(undefined, { employee2Name: "Akhil Menon" });
    let s = await sendWa(f, f.phones.manager, "assign Akhil | EdgeVerve Q2O | Storyboard");
    expect(s.outcomes).toContain("AWAITING_ASSIGNEE_CHOICE");
    const txt = lastOutbound("WHATSAPP", f.phones.manager)?.message.text ?? "";
    expect(txt).toContain('2 employees match "Akhil"');
    expect(txt).toContain("Akhil Rao");
    expect(txt).toContain("1. Akhil Menon");
    expect(txt).toContain("2. Akhil Rao");
    s = await sendWa(f, f.phones.manager, "1");
    expect(s.outcomes).toContain("AWAITING_ASSIGN_CONFIRMATION");
    expect(lastOutbound("WHATSAPP", f.phones.manager)?.message.text).toContain("Employee: Akhil Menon");
    await sendWa(f, f.phones.manager, "yes");
    const task = await prisma.task.findFirstOrThrow({ where: { organizationId: f.org.id }, include: { assignments: true } });
    expect(task.assignments[0].userId).toBe(f.employee2.userId);
  });

  it("asks for clarification on ambiguous dates", async () => {
    const f = await createFixture();
    const s = await sendWa(f, f.phones.manager, "assign Akhil | EVQ2O | Call client | due 12/10");
    expect(s.outcomes).toContain("AWAITING_DUE_CLARIFICATION");
    expect(lastOutbound("WHATSAPP", f.phones.manager)?.message.text).toContain("ambiguous");
    const s2 = await sendWa(f, f.phones.manager, "12 Oct 3pm");
    expect(s2.outcomes).toContain("AWAITING_ASSIGN_CONFIRMATION");
  });

  it("rejects unknown projects", async () => {
    const f = await createFixture();
    const s = await sendWa(f, f.phones.manager, "assign Akhil | Nonexistent | Task");
    expect(s.outcomes).toContain("PROJECT_NOT_FOUND");
    expect(await prisma.task.count({ where: { organizationId: f.org.id } })).toBe(0);
  });
});

describe("Manager assignment via Telegram", () => {
  it("/assign shows a preview with buttons; Create Task creates and sends", async () => {
    const f = await createFixture({ } as never, { defaultChannel: "TELEGRAM" });
    let s = await sendTg(f, f.tgIds.manager, "/assign Akhil | EdgeVerve Q2O | Finish keyframes | due tomorrow 2pm");
    expect(s.outcomes).toContain("AWAITING_ASSIGN_CONFIRMATION");
    const preview = lastOutbound("TELEGRAM", f.tgIds.manager);
    expect(preview?.message.text).toContain("Create this task?");
    expect(preview?.message.text).toContain("👤 Akhil Rao");
    expect(preview?.message.buttons?.map((b) => b.label)).toEqual(["✅ Create Task", "❌ Cancel"]);

    // the employee cannot confirm the manager's draft
    const bad = await clickTg(f, f.tgIds.employee, buttonData(preview, "Create Task"));
    expect(bad.outcomes).toContain("CONFIRMATION_EXPIRED");
    expect(await prisma.task.count({ where: { organizationId: f.org.id } })).toBe(0);

    s = await clickTg(f, f.tgIds.manager, buttonData(preview, "Create Task"));
    expect(s.outcomes).toContain("TASK_CREATED");
    const task = await prisma.task.findFirstOrThrow({ where: { organizationId: f.org.id }, include: { assignments: { include: { deliveries: true } } } });
    expect(task.assignments[0].deliveries[0]).toMatchObject({ channel: "TELEGRAM", status: "SENT" });
    expect(lastOutbound("TELEGRAM", f.tgIds.employee)?.message.text).toContain("Finish keyframes");
  });

  it("Cancel button discards the draft", async () => {
    const f = await createFixture();
    await sendTg(f, f.tgIds.manager, "assign Akhil | EVQ2O | Draft me");
    const preview = lastOutbound("TELEGRAM", f.tgIds.manager);
    const s = await clickTg(f, f.tgIds.manager, buttonData(preview, "Cancel"));
    expect(s.outcomes).toContain("COMMAND_CANCELLED");
    expect(await prisma.task.count({ where: { organizationId: f.org.id } })).toBe(0);
  });
});

describe("Telegram linking", () => {
  it("links an account with a single-use, org-scoped code", async () => {
    const f = await createFixture();
    const { IdentityService } = await import("../src");
    await prisma.userMessagingIdentity.delete({ where: { organizationId_userId_provider: { organizationId: f.org.id, userId: f.employee2.userId, provider: "TELEGRAM" } } });
    const { code } = await IdentityService.createTelegramLinkToken(f.employee2, f.employee2.userId);
    expect(code).toMatch(/^TW-[A-Z0-9]{6}$/);
    const other = await createFixture();
    // wrong organization's bot → rejected
    const bad = await sendTg(other, "777001", `/start ${code}`);
    expect(bad.outcomes).toContain("TELEGRAM_LINK_INVALID");
    const ok = await sendTg(f, "777001", `/start ${code}`);
    expect(ok.outcomes).toContain("TELEGRAM_LINKED");
    const identity = await prisma.userMessagingIdentity.findUniqueOrThrow({ where: { organizationId_userId_provider: { organizationId: f.org.id, userId: f.employee2.userId, provider: "TELEGRAM" } } });
    expect(identity.providerUserId).toBe("777001");
    expect(identity.verified).toBe(true);
    // single use
    const again = await sendTg(f, "777002", `/start ${code}`);
    expect(again.outcomes).toContain("TELEGRAM_LINK_INVALID");
  });
});
