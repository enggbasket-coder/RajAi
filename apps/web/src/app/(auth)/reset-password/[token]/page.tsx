import { JsonForm } from "@/components/forms";
import { Field } from "@/components/ui";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Choose a new password</h1>
      <JsonForm action="/api/auth/reset-password" submitLabel="Update password" redirectTo="/login" className="space-y-3">
        <input type="hidden" name="token" value={token} />
        <Field label="New password"><input name="password" type="password" className="input" required minLength={8} /></Field>
      </JsonForm>
    </>
  );
}
