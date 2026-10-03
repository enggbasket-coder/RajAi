import { prisma } from "@trackwise/database";
import { resolveActor, type Actor } from "@trackwise/auth";
import { hashPassword } from "@trackwise/shared";
import { mockMessaging } from "@trackwise/messaging";
import { buildWhatsAppInboundPayload } from "@trackwise/whatsapp";
import { buildTelegramCallbackUpdate, buildTelegramMessageUpdate } from "@trackwise/telegram";
import { processInboundEvent } from "../src";

export const NO_RETRY = [0, 0, 0];
let seq = 0;

export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE organizations, users RESTART IDENTITY CASCADE`);
  mockMessaging.reset();
}

export interface Fixture {
  org: { id: string; timezone: string };
  owner: Actor;
  manager: Actor;
  employee: Actor;
  employee2: Actor;
  waPhoneNumberId: string;
  tgConnectionId: string;
  phones: { employee: string; employee2: string; manager: string };
  tgIds: { employee: string; employee2: string; manager: string };
  project: { id: string; name: string };
  client: { id: string };
}

async function user(email: string, name: string) {
  return prisma.user.create({ data: { email, name, passwordHash: hashPassword("password123") } });
}

async function actorFor(u: { id: string; email: string; name: string; timezone: string | null }, orgId: string): Promise<Actor> {
  const a = await resolveActor({ id: u.id, email: u.email, name: u.name, timezone: u.timezone }, orgId);
  if (!a) throw new Error("actor not resolved");
  return a;
}

/** Create a fully wired organization with mock WhatsApp + Telegram connections and linked identities. */
export async function createFixture(prefix = `org${++seq}`, opts: { employee2Name?: string; defaultChannel?: "WEB" | "WHATSAPP" | "TELEGRAM" } = {}): Promise<Fixture> {
  const n = seq;
  const [o, m, e, e2] = await Promise.all([
    user(`${prefix}-owner@test.local`, "Olivia Owner"),
    user(`${prefix}-manager@test.local`, "Meera Manager"),
    user(`${prefix}-akhil@test.local`, "Akhil Rao"),
    user(`${prefix}-priya@test.local`, opts.employee2Name ?? "Priya Nair"),
  ]);
  const org = await prisma.organization.create({
    data: {
      name: `Org ${prefix}`,
      slug: `${prefix}-${Date.now()}`,
      timezone: "Asia/Kolkata",
      defaultManagementChannel: opts.defaultChannel ?? "WHATSAPP",
      members: { create: [{ userId: o.id, role: "OWNER" }, { userId: m.id, role: "MANAGER" }, { userId: e.id, role: "EMPLOYEE" }, { userId: e2.id, role: "EMPLOYEE" }] },
    },
  });
  const waPhoneNumberId = `phone-${prefix}-${n}`;
  await prisma.messagingConnection.create({ data: { organizationId: org.id, provider: "WHATSAPP", enabled: true, status: "CONNECTED", phoneNumberId: waPhoneNumberId } });
  const tg = await prisma.messagingConnection.create({ data: { organizationId: org.id, provider: "TELEGRAM", enabled: true, status: "CONNECTED", botUsername: `${prefix}_bot` } });
  const phones = { employee: `+1555${String(n).padStart(3, "0")}0001`, employee2: `+1555${String(n).padStart(3, "0")}0002`, manager: `+1555${String(n).padStart(3, "0")}0003` };
  const tgIds = { employee: `${n}0001`, employee2: `${n}0002`, manager: `${n}0003` };
  const now = new Date();
  const ids = [
    { userId: e.id, provider: "WHATSAPP" as const, providerUserId: phones.employee, phoneNumber: phones.employee },
    { userId: e.id, provider: "TELEGRAM" as const, providerUserId: tgIds.employee, providerChatId: tgIds.employee },
    { userId: e2.id, provider: "WHATSAPP" as const, providerUserId: phones.employee2, phoneNumber: phones.employee2 },
    { userId: e2.id, provider: "TELEGRAM" as const, providerUserId: tgIds.employee2, providerChatId: tgIds.employee2 },
    { userId: m.id, provider: "WHATSAPP" as const, providerUserId: phones.manager, phoneNumber: phones.manager },
    { userId: m.id, provider: "TELEGRAM" as const, providerUserId: tgIds.manager, providerChatId: tgIds.manager },
  ];
  for (const i of ids) await prisma.userMessagingIdentity.create({ data: { organizationId: org.id, verified: true, verifiedAt: now, optedIn: true, optedInAt: now, optInSource: "test", ...i } });
  const client = await prisma.client.create({ data: { organizationId: org.id, name: "EdgeVerve" } });
  const project = await prisma.project.create({ data: { organizationId: org.id, clientId: client.id, name: "EdgeVerve Q2O", code: "EVQ2O", managerUserId: m.id } });
  return {
    org: { id: org.id, timezone: org.timezone },
    owner: await actorFor(o, org.id),
    manager: await actorFor(m, org.id),
    employee: await actorFor(e, org.id),
    employee2: await actorFor(e2, org.id),
    waPhoneNumberId,
    tgConnectionId: tg.id,
    phones,
    tgIds,
    project: { id: project.id, name: project.name },
    client: { id: client.id },
  };
}

let msgSeq = 0;
export function waText(f: Fixture, from: string, text: string, messageId = `wamid.${Date.now()}.${++msgSeq}`) {
  return { payload: buildWhatsAppInboundPayload({ phoneNumberId: f.waPhoneNumberId, from, text, messageId }), messageId };
}
export async function sendWa(f: Fixture, from: string, text: string, messageId?: string) {
  const { payload } = waText(f, from, text, messageId);
  return processInboundEvent("WHATSAPP", payload);
}
export async function sendTg(f: Fixture, userId: string, text: string, updateId?: number) {
  return processInboundEvent("TELEGRAM", buildTelegramMessageUpdate({ userId, text, updateId }), { connectionId: f.tgConnectionId });
}
export async function clickTg(f: Fixture, userId: string, data: string, updateId?: number) {
  return processInboundEvent("TELEGRAM", buildTelegramCallbackUpdate({ userId, data, updateId }), { connectionId: f.tgConnectionId });
}

export function lastOutbound(provider: "WHATSAPP" | "TELEGRAM", to: string) {
  return mockMessaging.lastFor(provider, to);
}
export function outboundCount(provider: "WHATSAPP" | "TELEGRAM", to: string) {
  return mockMessaging.outbox().filter((r) => r.provider === provider && r.to.providerUserId === to).length;
}
export function buttonData(record: ReturnType<typeof lastOutbound>, label: string) {
  const b = record?.message.buttons?.find((x) => x.label.includes(label));
  if (!b?.data) throw new Error(`button ${label} not found`);
  return b.data;
}
