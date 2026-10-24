import {ConnectionService} from "@trackwise/core";
import { guard, requireActor } from "@/lib/session";
import { JsonForm } from "@/components/forms";
import { Card, Field, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TelegramSettings() {
  const actor = await requireActor();
  guard(actor, "messaging:configure");
  const { telegram: t, webhookUrls } = await ConnectionService.list(actor);
  return (
    <>
      <PageHeader title="Telegram settings" subtitle="Official Telegram Bot API. Saving registers the webhook with a secret token automatically." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Bot connection">
          <JsonForm action="/api/messaging/connections/telegram" submitLabel="Save & register webhook" className="space-y-3" successMessage="Saved">
            <Field label="Bot token" hint={t?.hasBotToken ? "Stored. Leave blank to keep." : "From @BotFather. Never exposed to the browser after saving."}><input name="botToken" type="password" className="input" autoComplete="off" /></Field>
            <Field label="Bot username" hint="Shown to employees for linking (deep link t.me/<bot>?start=CODE)."><input name="botUsername" className="input" defaultValue={t?.botUsername ?? ""} placeholder="trackwise_bot" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={t?.enabled ?? true} /> Enabled</label>
          </JsonForm>
          <dl className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
            <div className="flex justify-between"><dt>Bot ID</dt><dd>{t?.botId ?? "—"}</dd></div>
            <div className="flex justify-between"><dt>Webhook</dt><dd>{t?.webhookStatus ?? "—"}</dd></div>
            <div className="flex justify-between"><dt>Webhook URL</dt><dd className="break-all font-mono text-xs">{webhookUrls.telegram ?? "(saved after first configuration)"}</dd></div>
          </dl>
        </Card>
        <Card title="How employees connect">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Employee opens Trackwise → Settings → My messaging → <em>Connect Telegram</em>.</li>
            <li>Trackwise shows a one-time code such as <code>TW-X7K92P</code> (valid 15 min, organization-scoped).</li>
            <li>Employee opens the bot and sends <code>/start TW-X7K92P</code>.</li>
            <li>Trackwise links the Telegram user id and chat id to the member. Display names and usernames are never trusted for identity.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-500">Mode: <strong>{t?.mode ?? "mock"}</strong>. Set <code>TELEGRAM_PROVIDER=telegram</code> in production. APP_URL must be a public HTTPS URL for Telegram to deliver webhooks.</p>
        </Card>
      </div>
    </>
  );
}
