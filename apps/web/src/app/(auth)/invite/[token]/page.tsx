import Link from "next/link";
import { InvitationService } from "@trackwise/core";
import { getCurrentUser } from "@/lib/session";
import { JsonForm } from "@/components/forms";
import { Field } from "@/components/ui";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await InvitationService.getByToken(token);
  if (!inv) return <p className="text-sm text-rose-700">This invitation is invalid or has expired. Ask your manager to send a new one.</p>;
  const user = await getCurrentUser();
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Join {inv.organization.name}</h1>
      <p className="mb-4 text-sm text-slate-500">{inv.inviter} invited <strong>{inv.email}</strong> as <strong>{inv.role.toLowerCase()}</strong>.</p>
      {user ? (
        user.email === inv.email ? (
          <JsonForm action={`/api/invitations/${token}/accept`} submitLabel={`Join as ${user.name}`} redirectTo="/settings/profile" />
        ) : (
          <p className="text-sm text-amber-700">You are signed in as {user.email}. <Link className="underline" href={`/api/auth/logout?next=/invite/${token}`}>Sign out</Link> and sign in with {inv.email}.</p>
        )
      ) : (
        <JsonForm action={`/api/invitations/${token}/accept`} submitLabel="Create account & join" redirectTo="/settings/profile" className="space-y-3">
          <Field label="Your name"><input name="name" className="input" required /></Field>
          <Field label="Email"><input name="email" type="email" className="input" defaultValue={inv.email} readOnly /></Field>
          <Field label="Password" hint="At least 8 characters. Already have an account? Sign in first, then open this link again."><input name="password" type="password" className="input" required minLength={8} /></Field>
        </JsonForm>
      )}
    </>
  );
}
