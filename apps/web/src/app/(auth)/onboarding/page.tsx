import { requireUser } from "@/lib/session";
import { JsonForm } from "@/components/forms";
import { Field } from "@/components/ui";

export default async function OnboardingPage() {
  const user = await requireUser();
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Welcome, {user.name}</h1>
      <p className="mb-4 text-sm text-slate-500">You are not a member of any organization yet. Create one, or open the invitation link your manager sent you.</p>
      <JsonForm action="/api/organizations" submitLabel="Create organization" redirectTo="/dashboard" className="space-y-3">
        <Field label="Organization name"><input name="name" className="input" required /></Field>
        <Field label="Timezone"><input name="timezone" className="input" defaultValue="UTC" required /></Field>
      </JsonForm>
    </>
  );
}
