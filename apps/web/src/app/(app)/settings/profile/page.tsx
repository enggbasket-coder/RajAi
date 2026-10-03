import { IdentityService } from "@trackwise/core";
import { prisma } from "@trackwise/database";
import { requireActor } from "@/lib/session";
import { ActionButton, JsonForm } from "@/components/forms";
import { Card, Field, PageHeader } from "@/components/ui";
import { TelegramLink } from "./TelegramLink";

export const dynamic = "force-dynamic";

export default async function ProfileMessaging() {
  const actor = await requireActor();
  const me = await IdentityService.list(actor, actor.userId);
  const member = await prisma.organizationMember.findFirstOrThrow({ where: { organizationId: actor.organizationId, userId: actor.userId } });
  const wa = await prisma.messagingConnection.findUnique({ where: { organizationId_provider: { organizationId: actor.organizationId, provider: "WHATSAPP" } } });
  return (
    <>
      <PageHeader title="My messaging" subtitle="Where Trackwise sends your task assignments. You can disconnect at any time." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={<>WhatsApp {me.whatsapp?.verified && me.whatsapp.optedIn ? <span className="badge bg-emerald-100 text-emerald-800">Opted in</span> : me.whatsapp ? <span className="badge bg-amber-100 text-amber-800">Not opted in</span> : null}</>}>
          {!wa?.enabled ? <p className="text-sm text-slate-500">WhatsApp is not connected for this organization.</p> : null}
          {me.whatsapp ? (
            <div className="mb-3 text-sm">
              <div className="font-mono">{me.whatsapp.phoneMasked}</div>
              <div className="text-xs text-slate-500">{me.whatsapp.verified ? "Verified" : "Unverified"} · {me.whatsapp.optedIn ? `Opted in ${me.whatsapp.optedInAt?.toISOString().slice(0, 10)}` : "Opted out"}</div>
              <div className="mt-2 flex gap-2">
                <ActionButton action={`/api/users/${actor.userId}/messaging/whatsapp`} method="PATCH" body={{ optIn: !me.whatsapp.optedIn }} className="btn-secondary btn-sm">{me.whatsapp.optedIn ? "Opt out" : "Opt in"}</ActionButton>
                <ActionButton action={`/api/users/${actor.userId}/messaging/${me.whatsapp.id}`} method="DELETE" className="btn-secondary btn-sm" confirm="Remove your WhatsApp number?">Remove</ActionButton>
              </div>
            </div>
          ) : null}
          <JsonForm action={`/api/users/${actor.userId}/messaging/whatsapp`} submitLabel={me.whatsapp ? "Update number" : "Save & opt in"} className="space-y-3" successMessage="Saved">
            <Field label="Phone (international format)"><input name="phone" className="input" placeholder="+919876543210" required /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="optIn" defaultChecked /> I agree to receive Trackwise task messages on WhatsApp</label>
          </JsonForm>
        </Card>
        <Card title={<>Telegram {me.telegram?.verified ? <span className="badge bg-emerald-100 text-emerald-800">Connected</span> : <span className="badge bg-slate-200 text-slate-600">Not connected</span>}</>}>
          {!me.telegramEnabled ? <p className="text-sm text-slate-500">Telegram is not connected for this organization.</p> : me.telegram?.verified ? (
            <div className="text-sm">
              <div>{me.telegram.username ? `@${me.telegram.username}` : "Linked account"}</div>
              <div className="text-xs text-slate-500">Linked {me.telegram.linkedAt?.toISOString().slice(0, 10)}</div>
              <div className="mt-2"><ActionButton action={`/api/users/${actor.userId}/messaging/${me.telegram.id}`} method="DELETE" className="btn-secondary btn-sm" confirm="Disconnect Telegram?">Disconnect</ActionButton></div>
            </div>
          ) : (
            <TelegramLink userId={actor.userId} botUsername={me.telegramBotUsername} />
          )}
        </Card>
        <Card title="Preferred assignment channel">
          <JsonForm action={`/api/users/${actor.userId}`} method="PATCH" submitLabel="Save preference" className="space-y-3" successMessage="Saved">
            <Field label="Send my assignments via">
              <select name="preferredAssignmentChannel" className="input" defaultValue={member.preferredAssignmentChannel}>
                <option value="DEFAULT">Organization default</option><option value="WHATSAPP">WhatsApp</option><option value="TELEGRAM">Telegram</option><option value="BOTH">Both</option>
              </select>
            </Field>
            <p className="text-xs text-slate-500">With “Both”, accepting on either channel accepts everywhere. There is always a single assignment.</p>
          </JsonForm>
        </Card>
      </div>
    </>
  );
}
