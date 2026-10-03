import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@trackwise/database";
import { mockMessaging } from "@trackwise/messaging";
import { AssignmentService, MessagingService, createAndAssignTask } from "../src";
import { NO_RETRY, buttonData, clickTg, createFixture, lastOutbound, outboundCount, resetDb, sendTg, sendWa, type Fixture } from "./helpers";

beforeAll(async () => {
  await resetDb();
});

async function assignTo(f: Fixture, sendVia: "WHATSAPP" | "TELEGRAM" | "BOTH" | "WEB" | "PREFERENCE", who: "employee" | "employee2" = "employee", title = "Finish Act 2 keyframes") {
  const { task, sends } = await createAndAssignTask(f.manager, { projectId: f.project.id, title, assigneeUserIds: [f[who].userId], sendVia, retryDelaysMs: NO_RETRY, estimatedMinutes: 180 });
  const assignment = await prisma.taskAssignment.findFirstOrThrow({ where: { taskId: task.id } });
  return { task, assignment, sends };
}

describe("WhatsApp acceptance", () => {
  it("sends the assignment and marks it ACCEPTED when the employee replies 1", async () => {
    const f = await createFixture();
    const { assignment, sends } = await assignTo(f, "WHATSAPP");
    expect(sends[0].deliveries).toEqual([expect.objectContaining({ channel: "WHATSAPP", status: "SENT" })]);
    const out = lastOutbound("WHATSAPP", f.phones.employee);
    expect(out?.message.text).toContain("New Trackwise Task");
    expect(out?.message.text).toContain("1 — Accept");
    const delivery = await prisma.assignmentDelivery.findUniqueOrThrow({ where: { taskAssignmentId_channel: { taskAssignmentId: assignment.id, channel: "WHATSAPP" } } });
    expect(delivery.status).toBe("SENT");
    expect(delivery.externalMessageId).toBe(out?.id);

    const summary = await sendWa(f, f.phones.employee, "1");
    expect(summary.outcomes).toContain("ACCEPTED");
    const after = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(after.status).toBe("ACCEPTED");
    expect(after.respondedAt).not.toBeNull();
    expect(lastOutbound("WHATSAPP", f.phones.employee)?.message.text).toContain("Task accepted ✅");
    const task = await prisma.task.findUniqueOrThrow({ where: { id: assignment.taskId } });
    expect(task.status).toBe("ACCEPTED");
    // manager notified on the org default channel (WhatsApp)
    expect(lastOutbound("WHATSAPP", f.phones.manager)?.message.text).toContain("accepted");
    const audits = await prisma.auditLog.count({ where: { organizationId: f.org.id, action: "task.accepted" } });
    expect(audits).toBe(1);
  });

  it("applies provider delivery/read statuses to the delivery row", async () => {
    const f = await createFixture();
    const { assignment } = await assignTo(f, "WHATSAPP");
    const out = lastOutbound("WHATSAPP", f.phones.employee)!;
    const { buildWhatsAppStatusPayload } = await import("@trackwise/whatsapp");
    await (await import("../src")).processInboundEvent("WHATSAPP", buildWhatsAppStatusPayload({ phoneNumberId: f.waPhoneNumberId, messageId: out.id, status: "delivered", recipient: f.phones.employee }));
    await (await import("../src")).processInboundEvent("WHATSAPP", buildWhatsAppStatusPayload({ phoneNumberId: f.waPhoneNumberId, messageId: out.id, status: "read", recipient: f.phones.employee }));
    const d = await prisma.assignmentDelivery.findUniqueOrThrow({ where: { taskAssignmentId_channel: { taskAssignmentId: assignment.id, channel: "WHATSAPP" } } });
    expect(d.status).toBe("READ");
    expect(d.deliveredAt).not.toBeNull();
    expect(d.readAt).not.toBeNull();
  });
});

describe("Telegram acceptance", () => {
  it("sends inline buttons and accepts via callback", async () => {
    const f = await createFixture();
    const { assignment } = await assignTo(f, "TELEGRAM");
    const out = lastOutbound("TELEGRAM", f.tgIds.employee);
    expect(out?.message.text).toContain("🆕 New Trackwise Task");
    expect(out?.message.buttons?.map((b) => b.label)).toEqual(["✅ Accept", "❌ Reject", "📋 Open Task"]);
    const accept = buttonData(out, "Accept");
    expect(accept.startsWith("acc:")).toBe(true);

    const summary = await clickTg(f, f.tgIds.employee, accept);
    expect(summary.outcomes).toContain("ACCEPTED");
    const after = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(after.status).toBe("ACCEPTED");
    expect(mockMessaging.answeredCallbacks().length).toBeGreaterThan(0);
    const edited = lastOutbound("TELEGRAM", f.tgIds.employee);
    expect(edited?.message.text).toContain("✅ Accepted");
    expect(edited?.message.buttons?.[0].label).toContain("Open Timer");
  });

  it("rejects a tampered callback reference", async () => {
    const f = await createFixture();
    const { assignment } = await assignTo(f, "TELEGRAM");
    const summary = await clickTg(f, f.tgIds.employee, `acc:${assignment.id}:000000000000`);
    expect(summary.outcomes).toContain("CALLBACK_INVALID");
    expect((await prisma.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("PENDING");
  });
});

describe("Cross-channel acceptance", () => {
  it("accepting on Telegram makes a later WhatsApp '1' a no-op", async () => {
    const f = await createFixture();
    const { assignment } = await assignTo(f, "BOTH");
    const deliveries = await prisma.assignmentDelivery.findMany({ where: { taskAssignmentId: assignment.id } });
    expect(deliveries.map((d) => d.channel).sort()).toEqual(["TELEGRAM", "WHATSAPP"]);
    expect(await prisma.taskAssignment.count({ where: { taskId: assignment.taskId } })).toBe(1);

    await clickTg(f, f.tgIds.employee, buttonData(lastOutbound("TELEGRAM", f.tgIds.employee), "Accept"));
    const accepted = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(accepted.status).toBe("ACCEPTED");

    const summary = await sendWa(f, f.phones.employee, "1");
    expect(summary.outcomes).toContain("ALREADY_ACCEPTED");
    const again = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(again.respondedAt?.getTime()).toBe(accepted.respondedAt?.getTime());
    expect(lastOutbound("WHATSAPP", f.phones.employee)?.message.text).toContain("already been accepted");
    expect(await prisma.auditLog.count({ where: { organizationId: f.org.id, action: "task.accepted" } })).toBe(1);
  });

  it("accepting on WhatsApp updates the Telegram message", async () => {
    const f = await createFixture();
    await assignTo(f, "BOTH");
    await sendWa(f, f.phones.employee, "accept");
    const tg = lastOutbound("TELEGRAM", f.tgIds.employee);
    expect(tg?.message.text).toContain("Accepted (via WhatsApp)");
    expect(tg?.message.editMessageId).toBeTruthy();
  });
});

describe("Rejection flows", () => {
  it("WhatsApp: 2 → asks for reason → REJECTED with reason, manager notified", async () => {
    const f = await createFixture();
    const { assignment } = await assignTo(f, "WHATSAPP");
    let s = await sendWa(f, f.phones.employee, "2");
    expect(s.outcomes).toContain("AWAITING_REJECTION_REASON");
    expect(lastOutbound("WHATSAPP", f.phones.employee)?.message.text).toContain("short reason");
    expect((await prisma.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("PENDING");
    s = await sendWa(f, f.phones.employee, "Too many other deadlines this week");
    expect(s.outcomes).toContain("REJECTED");
    const a = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(a.status).toBe("REJECTED");
    expect(a.rejectionReason).toBe("Too many other deadlines this week");
    expect(lastOutbound("WHATSAPP", f.phones.manager)?.message.text).toContain("rejected");
    expect(lastOutbound("WHATSAPP", f.phones.manager)?.message.text).toContain("Too many other deadlines");
    const conv = await prisma.messagingConversation.findFirstOrThrow({ where: { organizationId: f.org.id, identity: { userId: f.employee.userId, provider: "WHATSAPP" } } });
    expect(conv.state).toBe("IDLE");
  });

  it("Telegram: Reject button → asks for reason → REJECTED", async () => {
    const f = await createFixture();
    const { assignment } = await assignTo(f, "TELEGRAM");
    await clickTg(f, f.tgIds.employee, buttonData(lastOutbound("TELEGRAM", f.tgIds.employee), "Reject"));
    expect(lastOutbound("TELEGRAM", f.tgIds.employee)?.message.text).toContain("short reason");
    const s = await sendTg(f, f.tgIds.employee, "Not my area");
    expect(s.outcomes).toContain("REJECTED");
    const a = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(a.status).toBe("REJECTED");
    expect(a.rejectionReason).toBe("Not my area");
  });
});

describe("Invalid WhatsApp reply", () => {
  it("prompts once and never loops", async () => {
    const f = await createFixture();
    await assignTo(f, "WHATSAPP");
    const before = outboundCount("WHATSAPP", f.phones.employee);
    await sendWa(f, f.phones.employee, "maybe later");
    expect(outboundCount("WHATSAPP", f.phones.employee)).toBe(before + 1);
    expect(lastOutbound("WHATSAPP", f.phones.employee)?.message.text).toContain("1 — Accept");
    await sendWa(f, f.phones.employee, "huh?");
    await sendWa(f, f.phones.employee, "???");
    expect(outboundCount("WHATSAPP", f.phones.employee)).toBe(before + 1);
    // still accepts afterwards
    await sendWa(f, f.phones.employee, "yes");
    expect(lastOutbound("WHATSAPP", f.phones.employee)?.message.text).toContain("Task accepted");
  });
});

describe("Duplicate webhook", () => {
  it("processes the same WhatsApp event once", async () => {
    const f = await createFixture();
    const { assignment } = await assignTo(f, "WHATSAPP");
    const before = outboundCount("WHATSAPP", f.phones.employee);
    const first = await sendWa(f, f.phones.employee, "1", "wamid.DUP1");
    const second = await sendWa(f, f.phones.employee, "1", "wamid.DUP1");
    expect(first.outcomes).toContain("ACCEPTED");
    expect(second.duplicates).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: assignment.id, action: "task.accepted" } })).toBe(1);
    expect(outboundCount("WHATSAPP", f.phones.employee)).toBe(before + 1);
    expect(await prisma.messagingWebhookEvent.count({ where: { externalEventId: "msg:wamid.DUP1" } })).toBe(1);
  });

  it("processes the same Telegram update once", async () => {
    const f = await createFixture();
    const { assignment } = await assignTo(f, "TELEGRAM");
    const data = buttonData(lastOutbound("TELEGRAM", f.tgIds.employee), "Accept");
    await clickTg(f, f.tgIds.employee, data, 424242);
    const second = await clickTg(f, f.tgIds.employee, data, 424242);
    expect(second.duplicates).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: assignment.id, action: "task.accepted" } })).toBe(1);
  });
});

describe("Sender security", () => {
  it("employee cannot run manager commands", async () => {
    const f = await createFixture();
    const before = await prisma.task.count({ where: { organizationId: f.org.id } });
    const s = await sendWa(f, f.phones.employee, "assign Priya | EdgeVerve Q2O | Hack the planet | due tomorrow 2pm");
    expect(s.outcomes).toContain("COMMAND_FORBIDDEN");
    expect(lastOutbound("WHATSAPP", f.phones.employee)?.message.text).toBe("You do not have permission to assign tasks.");
    expect(await prisma.task.count({ where: { organizationId: f.org.id } })).toBe(before);
  });

  it("unknown WhatsApp number cannot access anything and is never auto-created", async () => {
    const f = await createFixture();
    const { assignment } = await assignTo(f, "WHATSAPP");
    const users = await prisma.user.count();
    const s = await sendWa(f, "+19998887777", "1");
    expect(s.outcomes).toContain("UNKNOWN_WHATSAPP_NUMBER");
    expect(await prisma.user.count()).toBe(users);
    expect(await prisma.userMessagingIdentity.count({ where: { providerUserId: "+19998887777" } })).toBe(0);
    expect(outboundCount("WHATSAPP", "+19998887777")).toBe(0);
    expect((await prisma.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("PENDING");
  });

  it("unknown Telegram user is told to link and cannot act", async () => {
    const f = await createFixture();
    const { assignment } = await assignTo(f, "TELEGRAM");
    const data = buttonData(lastOutbound("TELEGRAM", f.tgIds.employee), "Accept");
    const s = await clickTg(f, "555555555", data);
    expect(s.outcomes).toContain("UNKNOWN_TELEGRAM_USER");
    expect((await prisma.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("PENDING");
    const t = await sendTg(f, "555555555", "hello");
    expect(t.outcomes).toContain("UNKNOWN_TELEGRAM_USER");
    expect(lastOutbound("TELEGRAM", "555555555")?.message.text).toContain("not linked");
    expect(await prisma.userMessagingIdentity.count({ where: { providerUserId: "555555555" } })).toBe(0);
  });

  it("identity from Organization A cannot mutate Organization B's task", async () => {
    const a = await createFixture();
    const b = await createFixture();
    const { assignment } = await assignTo(b, "BOTH");
    // A's employee replies to B's WhatsApp number
    const s1 = await sendWa(b, a.phones.employee, "1");
    expect(s1.outcomes).toContain("UNKNOWN_WHATSAPP_NUMBER");
    // A's employee clicks B's (valid, signed) Telegram button through A's bot
    const data = buttonData(lastOutbound("TELEGRAM", b.tgIds.employee), "Accept");
    const s2 = await clickTg(a, a.tgIds.employee, data);
    expect(s2.outcomes).toContain("CALLBACK_FORBIDDEN");
    // and through B's bot (unknown user there)
    const s3 = await clickTg(b, a.tgIds.employee, data);
    expect(s3.outcomes).toContain("UNKNOWN_TELEGRAM_USER");
    expect((await prisma.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("PENDING");
  });

  it("webhook for an unknown connection is stored but ignored", async () => {
    const f = await createFixture();
    const { processInboundEvent } = await import("../src");
    const { buildWhatsAppInboundPayload } = await import("@trackwise/whatsapp");
    const s = await processInboundEvent("WHATSAPP", buildWhatsAppInboundPayload({ phoneNumberId: "nope", from: f.phones.employee, text: "1", messageId: "wamid.X1" }));
    expect(s.outcomes).toContain("UNKNOWN_CONNECTION");
  });
});

describe("Messaging retry", () => {
  it("fails after max attempts, then a manual retry succeeds without duplicating records", async () => {
    const f = await createFixture();
    mockMessaging.failNext("WHATSAPP", 3);
    const { task, assignment, sends } = await assignTo(f, "WHATSAPP");
    expect(sends[0].deliveries[0].status).toBe("FAILED");
    let d = await prisma.assignmentDelivery.findUniqueOrThrow({ where: { taskAssignmentId_channel: { taskAssignmentId: assignment.id, channel: "WHATSAPP" } } });
    expect(d.attemptCount).toBe(3);
    expect(d.errorCode).toBe("MOCK_TEMPORARY");
    expect(lastOutbound("WHATSAPP", f.phones.manager)?.message.text).toContain("Could not deliver");

    const r = await MessagingService.retry(f.manager, assignment.id, undefined, NO_RETRY);
    expect(r.deliveries[0].status).toBe("SENT");
    d = await prisma.assignmentDelivery.findUniqueOrThrow({ where: { taskAssignmentId_channel: { taskAssignmentId: assignment.id, channel: "WHATSAPP" } } });
    expect(d.status).toBe("SENT");
    expect(d.attemptCount).toBe(4);
    expect(await prisma.taskAssignment.count({ where: { taskId: task.id } })).toBe(1);
    expect(await prisma.assignmentDelivery.count({ where: { taskAssignmentId: assignment.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { organizationId: f.org.id, action: "message.retry" } })).toBe(1);
  });

  it("re-sending an already sent assignment does not send again", async () => {
    const f = await createFixture();
    const { assignment } = await assignTo(f, "WHATSAPP");
    const before = outboundCount("WHATSAPP", f.phones.employee);
    await MessagingService.sendAssignment(assignment.id, { sendVia: "WHATSAPP", retryDelaysMs: NO_RETRY });
    expect(outboundCount("WHATSAPP", f.phones.employee)).toBe(before);
  });

  it("fails fast with a clear reason when the employee has not opted in", async () => {
    const f = await createFixture();
    await prisma.userMessagingIdentity.update({ where: { organizationId_userId_provider: { organizationId: f.org.id, userId: f.employee.userId, provider: "WHATSAPP" } }, data: { optedIn: false } });
    const { sends } = await assignTo(f, "WHATSAPP");
    expect(sends[0].deliveries[0]).toMatchObject({ status: "FAILED", errorCode: "NOT_OPTED_IN", errorMessage: "WhatsApp unavailable — employee has not opted in." });
  });

  it("falls back to the other channel only when the organization allows it", async () => {
    const f = await createFixture();
    await prisma.userMessagingIdentity.delete({ where: { organizationId_userId_provider: { organizationId: f.org.id, userId: f.employee.userId, provider: "TELEGRAM" } } });
    const r1 = await assignTo(f, "TELEGRAM", "employee", "No fallback");
    expect(r1.sends[0].deliveries[0].status).toBe("FAILED");
    await prisma.organization.update({ where: { id: f.org.id }, data: { allowChannelFallback: true } });
    const r2 = await assignTo(f, "TELEGRAM", "employee", "With fallback");
    expect(r2.sends[0].deliveries[0]).toMatchObject({ channel: "WHATSAPP", status: "SENT" });
  });
});

describe("Web acceptance", () => {
  it("employee can accept from the web and the result is identical", async () => {
    const f = await createFixture();
    const { assignment } = await assignTo(f, "WEB");
    const d = await prisma.assignmentDelivery.findFirstOrThrow({ where: { taskAssignmentId: assignment.id } });
    expect(d.channel).toBe("WEB");
    const r = await AssignmentService.respondAsActor(f.employee, assignment.id, "ACCEPT");
    expect(r.outcome).toBe("ACCEPTED");
    await expect(AssignmentService.respondAsActor(f.employee2, assignment.id, "ACCEPT")).rejects.toThrow(/not assigned to you/);
  });
});
