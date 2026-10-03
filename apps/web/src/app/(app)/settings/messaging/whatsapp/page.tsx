import {ConnectionService} from "@trackwise/core";
import { guard, requireActor } from "@/lib/session";
import { JsonForm } from "@/components/forms";
import { Card, Field, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function WhatsAppSettings() {
  const actor = await requireActor();
  guard(actor, "messaging:configure");
  const { whatsapp: w, webhookUrls } = await ConnectionService.list(actor);
  return (
    <>
      <PageHeader title="WhatsApp settings" subtitle="Official Meta WhatsApp Business Cloud API. Secrets are encrypted at rest and never sent back to the browser." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Connection">
          <JsonForm action="/api/messaging/connections/whatsapp" submitLabel="Save connection" className="space-y-3" successMessage="Saved">
            <Field label="WABA ID"><input name="wabaId" className="input" defaultValue={w?.wabaId ?? ""} /></Field>
            <Field label="Phone number ID" hint="From Meta → WhatsApp → API Setup. Inbound webhooks are matched to this organization by this ID."><input name="phoneNumberId" className="input" defaultValue={w?.phoneNumberId ?? ""} required /></Field>
            <Field label="Display phone number"><input name="displayPhoneNumber" className="input" defaultValue={w?.displayPhoneNumber ?? ""} placeholder="+1 555 010 0000" /></Field>
            <Field label="Access token" hint={w?.hasAccessToken ? "Stored. Leave blank to keep." : "System-user permanent token recommended."}><input name="accessToken" type="password" className="input" autoComplete="off" /></Field>
            <Field label="App secret" hint={w?.hasAppSecret ? "Stored. Used to verify X-Hub-Signature-256." : "Used to verify webhook signatures."}><input name="appSecret" type="password" className="input" autoComplete="off" /></Field>
            <Field label="Verify token" hint={w?.hasVerifyToken ? "Stored." : "Any string; paste the same value in Meta's webhook configuration."}><input name="verifyToken" type="password" className="input" autoComplete="off" /></Field>
            <Field label="Assignment template name" hint="Approved template used when the employee is outside the 24-hour session window. Body params: task, project, due, estimate."><input name="assignmentTemplateName" className="input" defaultValue={w?.assignmentTemplateName ?? ""} placeholder="trackwise_task_assignment" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={w?.enabled ?? true} /> Enabled</label>
          </JsonForm>
        </Card>
        <Card title="Webhook configuration">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>In Meta for Developers open your app → WhatsApp → Configuration.</li>
            <li>Callback URL: <code className="rounded bg-slate-100 px-1">{webhookUrls.whatsapp}</code></li>
            <li>Verify token: the value saved on the left.</li>
            <li>Subscribe to the <code>messages</code> webhook field.</li>
            <li>Employees must opt in before Trackwise sends them anything (Settings → My messaging).</li>
          </ol>
          <p className="mt-3 text-xs text-slate-500">Mode: <strong>{w?.mode ?? "mock"}</strong>. Set <code>WHATSAPP_PROVIDER=meta</code> in production; env values act as defaults when a field is empty here.</p>
        </Card>
      </div>
    </>
  );
}
