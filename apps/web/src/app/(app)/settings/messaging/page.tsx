import Link from "next/link";
import {ConnectionService, OrganizationService} from "@trackwise/core";
import { guard, requireActor } from "@/lib/session";
import { ActionButton, JsonForm } from "@/components/forms";
import { Card, Field, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MessagingSettings() {
  const actor = await requireActor();
  guard(actor, "messaging:configure");
  const [c, org] = await Promise.all([ConnectionService.list(actor), OrganizationService.get(actor)]);
  const status = (x: { enabled: boolean; status: string } | null) => (x?.enabled ? <span className="badge bg-emerald-100 text-emerald-800">Connected</span> : <span className="badge bg-slate-200 text-slate-600">Not connected</span>);
  return (
    <>
      <PageHeader title="Messaging channels" subtitle="Trackwise stays the source of truth; WhatsApp and Telegram are interfaces into it." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={<>WhatsApp {status(c.whatsapp)} <span className="ml-2 text-xs font-normal text-slate-400">provider: {c.whatsapp?.mode ?? process.env.WHATSAPP_PROVIDER ?? "mock"}</span></>} actions={<Link href="/settings/messaging/whatsapp" className="text-xs text-brand-600 hover:underline">Configure</Link>}>
          <dl className="space-y-1 text-sm text-slate-600">
            <div className="flex justify-between"><dt>Phone number</dt><dd>{c.whatsapp?.displayPhoneNumber ?? "—"}</dd></div>
            <div className="flex justify-between"><dt>Phone number ID</dt><dd className="font-mono text-xs">{c.whatsapp?.phoneNumberId ?? "—"}</dd></div>
            <div className="flex justify-between"><dt>Webhook</dt><dd className="font-mono text-xs">{c.webhookUrls.whatsapp}</dd></div>
            <div className="flex justify-between"><dt>Template</dt><dd>{c.whatsapp?.assignmentTemplateName ?? "session messages only"}</dd></div>
            {c.whatsapp?.lastError ? <div className="text-rose-700">{c.whatsapp.lastError}</div> : null}
          </dl>
          {c.whatsapp ? (
            <div className="mt-3 flex gap-2">
              <ActionButton action="/api/messaging/connections/enabled" body={{ provider: "WHATSAPP", test: true }} className="btn-secondary btn-sm">Test message to me</ActionButton>
              <ActionButton action="/api/messaging/connections/enabled" body={{ provider: "WHATSAPP", enabled: !c.whatsapp.enabled }} className="btn-secondary btn-sm">{c.whatsapp.enabled ? "Disable" : "Enable"}</ActionButton>
            </div>
          ) : null}
        </Card>
        <Card title={<>Telegram {status(c.telegram)} <span className="ml-2 text-xs font-normal text-slate-400">provider: {c.telegram?.mode ?? process.env.TELEGRAM_PROVIDER ?? "mock"}</span></>} actions={<Link href="/settings/messaging/telegram" className="text-xs text-brand-600 hover:underline">Configure</Link>}>
          <dl className="space-y-1 text-sm text-slate-600">
            <div className="flex justify-between"><dt>Bot</dt><dd>{c.telegram?.botUsername ? `@${c.telegram.botUsername}` : "—"}</dd></div>
            <div className="flex justify-between"><dt>Webhook status</dt><dd>{c.telegram?.webhookStatus ?? "—"}</dd></div>
            <div className="flex justify-between"><dt>Webhook URL</dt><dd className="break-all font-mono text-xs">{c.webhookUrls.telegram ?? "—"}</dd></div>
            {c.telegram?.lastError ? <div className="text-rose-700">{c.telegram.lastError}</div> : null}
          </dl>
          {c.telegram ? (
            <div className="mt-3 flex gap-2">
              <ActionButton action="/api/messaging/connections/enabled" body={{ provider: "TELEGRAM", test: true }} className="btn-secondary btn-sm">Test bot (message me)</ActionButton>
              <ActionButton action="/api/messaging/connections/enabled" body={{ provider: "TELEGRAM", enabled: !c.telegram.enabled }} className="btn-secondary btn-sm">{c.telegram.enabled ? "Disable" : "Enable"}</ActionButton>
            </div>
          ) : null}
        </Card>
        <Card title="Defaults" className="lg:col-span-2">
          <JsonForm action="/api/organizations/current" method="PATCH" submitLabel="Save" className="grid gap-3 md:grid-cols-2" successMessage="Saved">
            <Field label="Default management channel"><select name="defaultManagementChannel" className="input" defaultValue={org.defaultManagementChannel}><option value="WHATSAPP">WhatsApp</option><option value="TELEGRAM">Telegram</option><option value="WEB">Web</option></select></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="allowChannelFallback" defaultChecked={org.allowChannelFallback} /> Allow fallback channel</label>
          </JsonForm>
        </Card>
      </div>
    </>
  );
}
