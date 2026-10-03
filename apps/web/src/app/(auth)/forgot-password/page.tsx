import Link from "next/link";
import { JsonForm } from "@/components/forms";
import { Field } from "@/components/ui";

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Reset your password</h1>
      <JsonForm action="/api/auth/forgot-password" submitLabel="Send reset link" successMessage="If that email exists, a reset link has been generated. In development the link is printed to the server log." className="space-y-3">
        <Field label="Email"><input name="email" type="email" className="input" required /></Field>
      </JsonForm>
      <p className="mt-4 text-sm"><Link className="text-brand-600 hover:underline" href="/login">Back to sign in</Link></p>
    </>
  );
}
