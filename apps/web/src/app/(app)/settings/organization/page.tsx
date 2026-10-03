import {NOTIFICATION_DEFAULTS, OrganizationService, notificationEnabled} from "@trackwise/core";
import { guard, requireActor } from "@/lib/session";
import { JsonForm } from "@/components/forms";
import { Card, Field, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OrganizationSettings() {
  const actor = await requireActor();
  guard(actor, "org:manage");
  const org = await OrganizationService.get(actor);
  const keys = Object.keys(NOTIFICATION_DEFAULTS) as (keyof typeof NOTIFICATION_DEFAULTS)[];
  return (
    <>
      <PageHeader title="Organization settings" subtitle={`Slug: ${org.slug}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="General">
          <JsonForm action="/api/organizations/current" method="PATCH" submitLabel="Save" className="space-y-3" successMessage="Saved">
            <Field label="Name"><input name="name" className="input" defaultValue={org.name} required /></Field>
            <Field label="Timezone" hint="IANA name, e.g. Asia/Kolkata. Timestamps are stored in UTC and displayed in this zone."><input name="timezone" className="input" defaultValue={org.timezone} required /></Field>
            <Field label="Default management channel" hint="Used for notifications to managers and as the default employee assignment channel.">
              <select name="defaultManagementChannel" className="input" defaultValue={org.defaultManagementChannel}><option value="WEB">Web</option><option value="WHATSAPP">WhatsApp</option><option value="TELEGRAM">Telegram</option></select>
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowChannelFallback" defaultChecked={org.allowChannelFallback} /> Allow fallback to the other channel when the preferred one is unavailable</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="defaultBillable" defaultChecked={org.defaultBillable} /> New tasks billable by default</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="managersCreateClients" defaultChecked={org.managersCreateClients} /> Managers may create clients</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="managersCreateProjects" defaultChecked={org.managersCreateProjects} /> Managers may create projects</label>
          </JsonForm>
        </Card>
        <Card title="Time tracking">
          <JsonForm action="/api/organizations/current" method="PATCH" submitLabel="Save" className="space-y-3" successMessage="Saved">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="manualTimeEnabled" defaultChecked={org.manualTimeEnabled} /> Employees may add manual time (reason required, always marked)</label>
            <Field label="Idle threshold (minutes)" hint="The desktop agent prompts to keep or discard idle time after this long without input. Never automatic."><input name="idleTimeoutMinutes" type="number" min={1} max={240} className="input" defaultValue={org.idleTimeoutMinutes} /></Field>
            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              <div className="font-medium text-slate-700">Monitoring (Phase 2)</div>
              Activity %, screenshots and app/URL tracking are <strong>off</strong> and cannot be enabled in the MVP. Trackwise never records keystrokes, clipboard, webcam or audio.
            </div>
          </JsonForm>
        </Card>
        <Card title="Notifications" className="lg:col-span-2">
          <JsonForm action="/api/organizations/current" method="PATCH" submitLabel="Save notifications" className="space-y-2" successMessage="Saved" nestUnder="notificationSettings">
            <div className="grid gap-2 md:grid-cols-2">
              {keys.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={k} defaultChecked={notificationEnabled(org.notificationSettings, k)} /> {k.replace(/_/g, " ")}
                  {NOTIFICATION_DEFAULTS[k] ? <span className="text-xs text-slate-400">(default on)</span> : <span className="text-xs text-slate-400">(optional)</span>}
                </label>
              ))}
            </div>
          </JsonForm>
        </Card>
      </div>
    </>
  );
}
