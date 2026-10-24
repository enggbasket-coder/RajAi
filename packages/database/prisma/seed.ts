/**
 * Seed: "Trackwise Demo" organization with owner, manager, two employees, clients, projects,
 * tasks delivered through WhatsApp / Telegram and a week of time entries.
 * All phone numbers and Telegram ids are fake. Password for every account: password123
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { addDays, encryptSecret, hashPassword, signRef, startOfWeekInTz, zonedToUtc, zonedParts } from "@trackwise/shared";

const prisma = new PrismaClient();
const TZ = "Asia/Kolkata";
const PASSWORD = "password123";

async function main() {
  const existing = await prisma.organization.findUnique({ where: { slug: "trackwise-demo" } });
  if (existing) {
    console.log("Removing previous Trackwise Demo organization…");
    await prisma.organization.delete({ where: { id: existing.id } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@trackwise.demo" } } });
  }

  const passwordHash = hashPassword(PASSWORD);
  const [owner, manager, akhil, priya] = await Promise.all([
    prisma.user.create({ data: { email: "owner@trackwise.demo", name: "Olivia Owner", passwordHash, timezone: TZ } }),
    prisma.user.create({ data: { email: "manager@trackwise.demo", name: "Meera Manager", passwordHash, timezone: TZ } }),
    prisma.user.create({ data: { email: "akhil@trackwise.demo", name: "Akhil Rao", passwordHash, timezone: TZ } }),
    prisma.user.create({ data: { email: "priya@trackwise.demo", name: "Priya Nair", passwordHash, timezone: TZ } }),
  ]);

  const org = await prisma.organization.create({
    data: {
      name: "Trackwise Demo",
      slug: "trackwise-demo",
      timezone: TZ,
      defaultManagementChannel: "WHATSAPP",
      manualTimeEnabled: true,
      idleTimeoutMinutes: 10,
      members: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: manager.id, role: "MANAGER" },
          { userId: akhil.id, role: "EMPLOYEE", preferredAssignmentChannel: "TELEGRAM", managerUserId: manager.id },
          { userId: priya.id, role: "EMPLOYEE", preferredAssignmentChannel: "WHATSAPP", managerUserId: manager.id },
        ],
      },
    },
  });

  // Messaging connections (mock mode; secrets are placeholders, encrypted at rest).
  const wa = await prisma.messagingConnection.create({
    data: { organizationId: org.id, provider: "WHATSAPP", enabled: true, status: "CONNECTED", wabaId: "demo-waba", phoneNumberId: "demo-phone-number-id", displayPhoneNumber: "+1 555 010 0000", accessTokenEncrypted: encryptSecret("demo-access-token"), verifyTokenEncrypted: encryptSecret("demo-verify-token"), appSecretEncrypted: encryptSecret("demo-app-secret"), webhookStatus: "MOCK" },
  });
  const tg = await prisma.messagingConnection.create({
    data: { organizationId: org.id, provider: "TELEGRAM", enabled: true, status: "CONNECTED", botId: "7000000001", botUsername: "trackwise_demo_bot", botTokenEncrypted: encryptSecret("0000000000:demo-bot-token"), webhookSecretEncrypted: encryptSecret("demo-webhook-secret"), webhookStatus: "MOCK" },
  });

  const now = new Date();
  const idn = (userId: string, provider: "WHATSAPP" | "TELEGRAM", providerUserId: string, extra: Partial<Prisma.UserMessagingIdentityUncheckedCreateInput> = {}) =>
    prisma.userMessagingIdentity.create({ data: { organizationId: org.id, userId, provider, providerUserId, verified: true, verifiedAt: now, optedIn: true, optedInAt: now, optInSource: "seed", ...extra } });
  await idn(akhil.id, "WHATSAPP", "+15550100001", { phoneNumber: "+15550100001" });
  await idn(akhil.id, "TELEGRAM", "100000001", { providerChatId: "100000001", username: "akhil_demo" });
  await idn(priya.id, "WHATSAPP", "+15550100002", { phoneNumber: "+15550100002" });
  await idn(priya.id, "TELEGRAM", "100000002", { providerChatId: "100000002", username: "priya_demo" });
  await idn(manager.id, "WHATSAPP", "+15550100003", { phoneNumber: "+15550100003" });
  await idn(manager.id, "TELEGRAM", "100000003", { providerChatId: "100000003", username: "meera_demo" });

  // Clients & projects
  const edgeverve = await prisma.client.create({ data: { organizationId: org.id, name: "EdgeVerve", code: "EDGE", notes: "Animation studio client" } });
  const northwind = await prisma.client.create({ data: { organizationId: org.id, name: "Northwind Traders", code: "NWT" } });
  const q2o = await prisma.project.create({ data: { organizationId: org.id, clientId: edgeverve.id, name: "EdgeVerve Q2O", code: "EVQ2O", managerUserId: manager.id, budgetHours: 120, billable: true, hourlyRate: 45, status: "ACTIVE", description: "Quarter-two onboarding animation." } });
  const site = await prisma.project.create({ data: { organizationId: org.id, clientId: edgeverve.id, name: "EdgeVerve Marketing Site", code: "EVSITE", managerUserId: manager.id, budgetHours: 60, billable: true, hourlyRate: 40, status: "ACTIVE" } });
  const mobile = await prisma.project.create({ data: { organizationId: org.id, clientId: northwind.id, name: "Northwind Mobile App", code: "NWAPP", managerUserId: manager.id, budgetHours: 200, billable: false, status: "ACTIVE", description: "Internal, non-billable R&D." } });

  const due = (daysAhead: number, hour: number) => {
    const p = zonedParts(addDays(now, daysAhead), TZ);
    return zonedToUtc(TZ, p.year, p.month, p.day, hour, 0);
  };

  async function task(data: Omit<Prisma.TaskUncheckedCreateInput, "organizationId" | "createdByUserId">) {
    return prisma.task.create({ data: { organizationId: org.id, createdByUserId: manager.id, ...data } });
  }
  async function assign(taskId: string, userId: string, status: "PENDING" | "ACCEPTED" | "REJECTED", channels: ("WHATSAPP" | "TELEGRAM")[], opts: { acceptedVia?: "WHATSAPP" | "TELEGRAM"; minutesAgo?: number; rejectionReason?: string } = {}) {
    const assignedAt = new Date(now.getTime() - (opts.minutesAgo ?? 120) * 60000);
    const a = await prisma.taskAssignment.create({ data: { organizationId: org.id, taskId, userId, assignedByUserId: manager.id, assignedAt, status, respondedAt: status === "PENDING" ? null : new Date(assignedAt.getTime() + 120000), rejectionReason: opts.rejectionReason ?? null, preferredChannel: channels.length === 2 ? "BOTH" : channels[0] } });
    const t = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { project: true } });
    await prisma.auditLog.create({ data: { organizationId: org.id, actorUserId: manager.id, action: "task.assigned", entityType: "TaskAssignment", entityId: a.id, metadataJson: { taskId, userId }, createdAt: assignedAt } });
    for (const channel of channels) {
      const ext = `seed-${channel.toLowerCase()}-${a.id.slice(-6)}`;
      const sentAt = new Date(assignedAt.getTime() + 2000);
      await prisma.assignmentDelivery.create({ data: { organizationId: org.id, taskAssignmentId: a.id, channel, status: channel === "WHATSAPP" ? "DELIVERED" : "SENT", externalMessageId: ext, attemptCount: 1, lastAttemptAt: sentAt, sentAt, deliveredAt: channel === "WHATSAPP" ? new Date(sentAt.getTime() + 3000) : null } });
      await prisma.communicationMessage.create({ data: { organizationId: org.id, taskId, taskAssignmentId: a.id, userId, channel, direction: "OUTBOUND", messageType: channel === "TELEGRAM" ? "BUTTON" : "TEXT", externalMessageId: ext, body: `${channel === "TELEGRAM" ? "🆕 " : ""}New Trackwise Task\nTask: ${t.title}\nProject: ${t.project.name}`, status: channel === "WHATSAPP" ? "DELIVERED" : "SENT", sentAt, deliveredAt: channel === "WHATSAPP" ? new Date(sentAt.getTime() + 3000) : null, createdAt: sentAt, metadataJson: channel === "TELEGRAM" ? { buttons: ["✅ Accept", "❌ Reject", "📋 Open Task"], acceptRef: signRef("acc", a.id) } : {} } });
    }
    if (status !== "PENDING" && opts.acceptedVia) {
      const at = new Date(assignedAt.getTime() + 120000);
      await prisma.communicationMessage.create({ data: { organizationId: org.id, taskId, taskAssignmentId: a.id, userId, channel: opts.acceptedVia, direction: "INBOUND", messageType: opts.acceptedVia === "TELEGRAM" ? "CALLBACK" : "TEXT", externalMessageId: `seed-in-${a.id.slice(-6)}`, body: opts.acceptedVia === "TELEGRAM" ? "✅ Accept" : status === "ACCEPTED" ? "1" : "2", status: "RECEIVED", receivedAt: at, createdAt: at } });
      await prisma.auditLog.create({ data: { organizationId: org.id, actorUserId: userId, action: status === "ACCEPTED" ? "task.accepted" : "task.rejected", entityType: "TaskAssignment", entityId: a.id, metadataJson: { taskId, via: opts.acceptedVia, reason: opts.rejectionReason }, createdAt: at } });
      await prisma.communicationMessage.create({ data: { organizationId: org.id, taskId, taskAssignmentId: a.id, userId, channel: opts.acceptedVia, direction: "OUTBOUND", messageType: "TEXT", externalMessageId: `seed-out-${a.id.slice(-6)}`, body: status === "ACCEPTED" ? `Task accepted ✅\n${t.title}` : `Task rejected ❌\n${t.title}`, status: "SENT", sentAt: new Date(at.getTime() + 1000), createdAt: new Date(at.getTime() + 1000) } });
    }
    return a;
  }

  // Task 1 — Akhil, WhatsApp, accepted
  const t1 = await task({ projectId: q2o.id, title: "Finish Act 2 keyframes", description: "Please complete the remaining animation frames.", dueAt: due(1, 14), estimatedMinutes: 180, priority: "HIGH", billable: true, status: "ACCEPTED" });
  await assign(t1.id, akhil.id, "ACCEPTED", ["WHATSAPP"], { acceptedVia: "WHATSAPP", minutesAgo: 300 });
  // Task 2 — Priya, Telegram, pending
  const t2 = await task({ projectId: site.id, title: "Design onboarding screens", description: "Three screens for the new signup flow.", dueAt: due(2, 18), estimatedMinutes: 240, priority: "NORMAL", billable: true, status: "ASSIGNED" });
  await assign(t2.id, priya.id, "PENDING", ["TELEGRAM"], { minutesAgo: 45 });
  // Task 3 — Akhil, WhatsApp + Telegram, accepted through Telegram
  const t3 = await task({ projectId: q2o.id, title: "Export animation deliverables", description: "Render final MP4 + Lottie exports.", dueAt: due(3, 12), estimatedMinutes: 120, priority: "URGENT", billable: true, status: "ACCEPTED" });
  await assign(t3.id, akhil.id, "ACCEPTED", ["WHATSAPP", "TELEGRAM"], { acceptedVia: "TELEGRAM", minutesAgo: 90 });
  // Task 4 — Priya, WhatsApp, rejected with reason
  const t4 = await task({ projectId: mobile.id, title: "Prototype offline sync", description: "Spike on local-first storage.", dueAt: due(5, 17), estimatedMinutes: 480, priority: "LOW", billable: false, status: "ASSIGNED" });
  await assign(t4.id, priya.id, "REJECTED", ["WHATSAPP"], { acceptedVia: "WHATSAPP", minutesAgo: 1500, rejectionReason: "Fully booked on EdgeVerve this week" });
  // Task 5 — completed last week (both employees)
  const t5 = await task({ projectId: mobile.id, title: "Set up CI pipeline", estimatedMinutes: 240, priority: "NORMAL", billable: false, status: "COMPLETED", completedAt: addDays(now, -3), completedByUserId: akhil.id });
  await assign(t5.id, akhil.id, "ACCEPTED", ["TELEGRAM"], { acceptedVia: "TELEGRAM", minutesAgo: 10000 });
  // Task 6 — draft, unassigned
  await task({ projectId: site.id, title: "Write landing page copy", priority: "NORMAL", billable: true, status: "DRAFT" });

  // Time entries: last week (Mon–Fri) + a couple this week.
  const thisWeek = startOfWeekInTz(now, TZ);
  const lastWeek = addDays(thisWeek, -7);
  async function entry(userId: string, projectId: string, taskId: string | null, dayOffset: number, startHour: number, hours: number, weekStart: Date, extra: Partial<Prisma.TimeEntryUncheckedCreateInput> = {}) {
    const p = zonedParts(addDays(weekStart, dayOffset), TZ);
    const startedAt = zonedToUtc(TZ, p.year, p.month, p.day, startHour, 0);
    const stoppedAt = new Date(startedAt.getTime() + hours * 3600000);
    if (stoppedAt > now) return null;
    return prisma.timeEntry.create({ data: { organizationId: org.id, userId, projectId, taskId, startedAt, stoppedAt, durationSeconds: hours * 3600, source: "WEB", billable: true, status: "RECORDED", ...extra } });
  }
  const akhilLast = [];
  for (let d = 0; d < 5; d++) {
    akhilLast.push(await entry(akhil.id, q2o.id, t1.id, d, 10, 3, lastWeek));
    akhilLast.push(await entry(akhil.id, mobile.id, t5.id, d, 14, 2, lastWeek, { billable: false }));
  }
  akhilLast.push(await entry(akhil.id, q2o.id, t3.id, 2, 17, 1, lastWeek, { source: "MANUAL", manual: true, manualReason: "Forgot to start the timer during the client call" }));
  const priyaLast = [];
  for (let d = 0; d < 5; d++) {
    priyaLast.push(await entry(priya.id, site.id, t2.id, d, 9, 4, lastWeek));
    if (d % 2 === 0) priyaLast.push(await entry(priya.id, mobile.id, null, d, 15, 1.5, lastWeek, { billable: false }));
  }
  // Akhil: last week SUBMITTED (awaiting approval)
  const tsA = await prisma.timesheet.create({ data: { organizationId: org.id, userId: akhil.id, weekStart: lastWeek, status: "SUBMITTED", submittedAt: addDays(thisWeek, 0) } });
  await prisma.timeEntry.updateMany({ where: { id: { in: akhilLast.filter(Boolean).map((e) => e!.id) } }, data: { status: "SUBMITTED", timesheetId: tsA.id } });
  // Priya: last week APPROVED by manager
  const tsP = await prisma.timesheet.create({ data: { organizationId: org.id, userId: priya.id, weekStart: lastWeek, status: "APPROVED", submittedAt: addDays(thisWeek, 0), reviewedAt: addDays(thisWeek, 0.1), reviewedByUserId: manager.id } });
  await prisma.timeEntry.updateMany({ where: { id: { in: priyaLast.filter(Boolean).map((e) => e!.id) } }, data: { status: "APPROVED", timesheetId: tsP.id } });
  await prisma.auditLog.create({ data: { organizationId: org.id, actorUserId: priya.id, action: "timesheet.submitted", entityType: "Timesheet", entityId: tsP.id } });
  await prisma.auditLog.create({ data: { organizationId: org.id, actorUserId: manager.id, action: "timesheet.approved", entityType: "Timesheet", entityId: tsP.id, metadataJson: { userId: priya.id } } });
  // This week so far
  for (let d = 0; d < 7; d++) {
    await entry(akhil.id, q2o.id, t1.id, d, 10, 2.5, thisWeek);
    await entry(priya.id, site.id, t2.id, d, 9, 3, thisWeek);
  }
  await prisma.timesheet.createMany({ data: [{ organizationId: org.id, userId: akhil.id, weekStart: thisWeek }, { organizationId: org.id, userId: priya.id, weekStart: thisWeek }] });

  await prisma.auditLog.create({ data: { organizationId: org.id, actorUserId: owner.id, action: "organization.created", entityType: "Organization", entityId: org.id } });
  await prisma.auditLog.create({ data: { organizationId: org.id, actorUserId: owner.id, action: "messaging.configuration_changed", entityType: "MessagingConnection", entityId: wa.id, metadataJson: { provider: "WHATSAPP", enabled: true } } });
  await prisma.auditLog.create({ data: { organizationId: org.id, actorUserId: owner.id, action: "messaging.configuration_changed", entityType: "MessagingConnection", entityId: tg.id, metadataJson: { provider: "TELEGRAM", enabled: true } } });

  console.log(`
Seeded "Trackwise Demo" (${org.slug}). Password for all accounts: ${PASSWORD}
  owner@trackwise.demo    OWNER
  manager@trackwise.demo  MANAGER  (WhatsApp +15550100003 · Telegram id 100000003)
  akhil@trackwise.demo    EMPLOYEE (WhatsApp +15550100001 · Telegram id 100000001, prefers Telegram)
  priya@trackwise.demo    EMPLOYEE (WhatsApp +15550100002 · Telegram id 100000002, prefers WhatsApp)
WhatsApp mock phone_number_id: demo-phone-number-id · Telegram connection id: ${tg.id}
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
