import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@trackwise/database";
import { buildWhatsAppInboundPayload } from "@trackwise/whatsapp";
import { createAndAssignTask, processInboundEvent } from "../src";
import { NO_RETRY, createFixture, lastOutbound, outboundCount, resetDb, type Fixture } from "./helpers";

const SHARED = "shared-platform-phone";
let n = 0;
const wa = (from: string, text: string) => processInboundEvent("WHATSAPP", buildWhatsAppInboundPayload({ phoneNumberId: SHARED, from, text, messageId: `wamid.shared.${Date.now()}.${++n}` }));

/** An organization on the shared platform number: no WhatsApp connection row of its own. */
async function sharedOrg(prefix?: string) {
  const f = await createFixture(prefix);
  await prisma.messagingConnection.deleteMany({ where: { organizationId: f.org.id, provider: "WHATSAPP" } });
  return f;
}

async function assign(f: Fixture, who: "employee" | "employee2" = "employee", title = "Inspect pump at site B") {
  const { task } = await createAndAssignTask(f.manager, { projectId: f.project.id, title, assigneeUserIds: [f[who].userId], sendVia: "WHATSAPP", retryDelaysMs: NO_RETRY });
  return prisma.taskAssignment.findFirstOrThrow({ where: { taskId: task.id } });
}

beforeAll(async () => {
  process.env.META_PHONE_NUMBER_ID = SHARED;
  process.env.META_DISPLAY_NAME = "Trackwise by PlusBrains";
  await resetDb();
});
afterAll(() => {
  delete process.env.META_PHONE_NUMBER_ID;
});

describe("Shared platform WhatsApp number", () => {
  it("sends through the shared number when the organization has no connection and routes the reply by sender phone", async () => {
    const f = await sharedOrg();
    const a = await assign(f);
    const out = lastOutbound("WHATSAPP", f.phones.employee);
    expect(out?.message.text).toContain("Inspect pump at site B");
    const delivery = await prisma.assignmentDelivery.findUniqueOrThrow({ where: { taskAssignmentId_channel: { taskAssignmentId: a.id, channel: "WHATSAPP" } } });
    expect(delivery.status).toBe("SENT");

    const summary = await wa(f.phones.employee, "1");
    expect(summary.outcomes).toContain("ACCEPTED");
    expect((await prisma.taskAssignment.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("ACCEPTED");
    expect(lastOutbound("WHATSAPP", f.phones.manager)?.message.text).toContain("accepted");
  });

  it("keeps using an organization's own number when it has one", async () => {
    const f = await createFixture();
    await assign(f);
    const summary = await processInboundEvent("WHATSAPP", buildWhatsAppInboundPayload({ phoneNumberId: f.waPhoneNumberId, from: f.phones.employee, text: "1", messageId: `wamid.own.${Date.now()}` }));
    expect(summary.outcomes).toContain("ACCEPTED");
  });

  it("never answers or auto-creates an unknown number on the shared line", async () => {
    await sharedOrg();
    const before = (await import("@trackwise/messaging")).mockMessaging.outbox().length;
    const summary = await wa("+15559990000", "hello");
    expect(summary.outcomes).toContain("UNKNOWN_SENDER");
    expect((await import("@trackwise/messaging")).mockMessaging.outbox().length).toBe(before);
    expect(await prisma.user.count({ where: { email: { contains: "15559990000" } } })).toBe(0);
  });

  it("asks a person who belongs to two organizations which one they mean, then remembers the choice", async () => {
    const a = await sharedOrg();
    const b = await sharedOrg();
    const nameOf = async (id: string) => (await prisma.organization.findUniqueOrThrow({ where: { id } })).name;
    // The same phone is a verified, opted-in member of both organizations.
    const phone = a.phones.employee;
    await prisma.userMessagingIdentity.update({ where: { organizationId_userId_provider: { organizationId: b.org.id, userId: b.employee.userId, provider: "WHATSAPP" } }, data: { providerUserId: phone, phoneNumber: phone } });

    const ask = await wa(phone, "help");
    expect(ask.outcomes).toContain("ORG_CHOICE_REQUESTED");
    const prompt = lastOutbound("WHATSAPP", phone)?.message.text ?? "";
    expect(prompt).toContain(`1. ${await nameOf(a.org.id)}`);
    expect(prompt).toContain(`2. ${await nameOf(b.org.id)}`);

    const pick = await wa(phone, "2");
    expect(pick.outcomes).toContain("ORG_SELECTED");
    expect(lastOutbound("WHATSAPP", phone)?.message.text).toContain(await nameOf(b.org.id));

    // Within 24h the sender is routed to the chosen organization without being asked again.
    const assignment = await assign(b);
    const n0 = outboundCount("WHATSAPP", phone);
    const accept = await wa(phone, "1");
    expect(accept.outcomes).toContain("ACCEPTED");
    expect((await prisma.taskAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("ACCEPTED");
    expect(outboundCount("WHATSAPP", phone)).toBeGreaterThan(n0);
    const aAssignments = await prisma.taskAssignment.count({ where: { organizationId: a.org.id, status: "ACCEPTED" } });
    expect(aAssignments).toBe(0);
  });

  it("reports monthly usage per organization with conversations and estimated cost", async () => {
    const { UsageService, currentMonth } = await import("../src");
    const f = await sharedOrg();
    await assign(f);
    await assign(f, "employee2");
    await wa(f.phones.employee, "1");
    const report = await UsageService.whatsappMonthly(currentMonth(), { rate: 0.5 });
    const row = report.rows.find((r) => r.organizationId === f.org.id)!;
    expect(row.outbound).toBeGreaterThanOrEqual(3); // 2 assignments + accept confirmation (+ manager notice)
    expect(row.inbound).toBe(1);
    expect(row.recipients).toBeGreaterThanOrEqual(2);
    expect(row.conversations).toBeGreaterThanOrEqual(2);
    expect(row.estimatedCost).toBe(Math.round(row.conversations * 0.5 * 100) / 100);
    const csv = UsageService.toCsv(report);
    expect(csv.split("\n")[0]).toContain("conversations");
    expect(csv).toContain("Prepared with PlusBrains AI");
  });
});
