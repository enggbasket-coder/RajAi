import { prisma } from "@trackwise/database";
import { listMemberships } from "@trackwise/auth";
import { OrgList } from "./OrgList";
import { requireActor } from "@/lib/session";
import { JsonForm } from "@/components/forms";
import { Avatar, Badge, Card, Field, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const actor = await requireActor();
  const member = await prisma.organizationMember.findFirstOrThrow({ where: { organizationId: actor.organizationId, userId: actor.userId } });
  const memberships = await listMemberships(actor.userId);
  return (
    <>
      <PageHeader title="My account" subtitle="Your profile, display name in this organization and password." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Profile">
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={actor.user.name} size={48} />
            <div>
              <div className="font-medium text-slate-900">{actor.user.name}</div>
              <div className="text-sm text-slate-500">{actor.user.email}</div>
              <Badge value={actor.role} className="mt-1" />
            </div>
          </div>
          <JsonForm action="/api/auth/me" method="PATCH" submitLabel="Save profile" className="space-y-3" successMessage="Profile saved">
            <Field label="Full name"><input name="name" className="input" defaultValue={actor.user.name} required /></Field>
            <Field label="Personal timezone" hint="Optional. Leave blank to use the organization timezone."><input name="timezone" className="input" defaultValue={actor.user.timezone ?? ""} placeholder="Asia/Kolkata" /></Field>
          </JsonForm>
        </Card>
        <Card title="In this organization">
          <JsonForm action={`/api/users/${actor.userId}`} method="PATCH" submitLabel="Save" className="space-y-3" successMessage="Saved">
            <Field label="Display name" hint="How teammates and WhatsApp/Telegram commands refer to you. Blank uses your full name."><input name="displayName" className="input" defaultValue={member.displayName ?? ""} placeholder={actor.user.name} /></Field>
            <Field label="Preferred assignment channel">
              <select name="preferredAssignmentChannel" className="input" defaultValue={member.preferredAssignmentChannel}>
                <option value="DEFAULT">Organization default</option><option value="WHATSAPP">WhatsApp</option><option value="TELEGRAM">Telegram</option><option value="BOTH">Both</option>
              </select>
            </Field>
          </JsonForm>
        </Card>
        <Card title="Organizations" className="lg:col-span-3" actions={<span className="text-xs text-slate-500">{memberships.length} total</span>}>
          <div className="grid gap-6 md:grid-cols-2">
            <OrgList current={actor.organizationId} organizations={memberships.map((m) => ({ id: m.organizationId, name: m.organization.name, role: m.role }))} />
            <div id="new-organization">
              <div className="mb-2 text-sm font-medium text-slate-900">Create a new organization</div>
              <p className="mb-3 text-xs text-slate-500">You become its owner. Each organization has its own members, projects, messaging channels and data.</p>
              <JsonForm action="/api/organizations" submitLabel="Create organization" redirectTo="/dashboard" className="space-y-3">
                <Field label="Organization name"><input name="name" className="input" required placeholder="Acme Studio" /></Field>
                <Field label="Timezone"><input name="timezone" className="input" defaultValue={actor.user.timezone ?? "Asia/Kolkata"} required /></Field>
              </JsonForm>
            </div>
          </div>
        </Card>
        <Card title="Change password">
          <JsonForm action="/api/auth/change-password" submitLabel="Update password" className="space-y-3" successMessage="Password updated">
            <Field label="Current password"><input name="currentPassword" type="password" className="input" required autoComplete="current-password" /></Field>
            <Field label="New password" hint="At least 8 characters"><input name="newPassword" type="password" className="input" required minLength={8} autoComplete="new-password" /></Field>
          </JsonForm>
        </Card>
      </div>
    </>
  );
}
