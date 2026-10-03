import Link from "next/link";
import { JsonForm } from "@/components/forms";
import { Field } from "@/components/ui";

export default function RegisterPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Create your Trackwise organization</h1>
      <p className="mb-4 text-sm text-slate-500">You will become the owner. Invite managers and employees afterwards.</p>
      <JsonForm action="/api/auth/register" submitLabel="Create organization" redirectTo="/dashboard" className="space-y-3">
        <Field label="Your name"><input name="name" className="input" required /></Field>
        <Field label="Email"><input name="email" type="email" className="input" required /></Field>
        <Field label="Password" hint="At least 8 characters"><input name="password" type="password" className="input" required minLength={8} /></Field>
        <Field label="Organization name"><input name="organizationName" className="input" required /></Field>
        <Field label="Timezone"><input name="timezone" className="input" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} required /></Field>
      </JsonForm>
      <p className="mt-4 text-sm"><Link className="text-brand-600 hover:underline" href="/login">Already have an account? Sign in</Link></p>
    </>
  );
}
