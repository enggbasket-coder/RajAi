"use client";
import { useState } from "react";
import { JsonForm } from "@/components/forms";
import { Field } from "@/components/ui";

export function ForgotForm() {
  const [url, setUrl] = useState<string | null>(null);
  return (
    <>
      <JsonForm action="/api/auth/forgot-password" submitLabel="Create reset link" successMessage="If that email belongs to an account, a reset link has been created. Email delivery is not configured yet, so ask your administrator for the link from the server log." className="space-y-3" onSuccess={(d) => setUrl(d.devResetUrl ?? null)}>
        <Field label="Email"><input name="email" type="email" className="input" required /></Field>
      </JsonForm>
      {url ? (
        <div className="mt-4 rounded-sharp bg-emerald-50 p-3 text-sm dark:bg-emerald-500/10">
          <div className="mb-1 font-medium text-emerald-800 dark:text-emerald-300">Reset link (shown because developer tools are enabled)</div>
          <a className="break-all text-xs text-brand-600 underline" href={url}>{url}</a>
        </div>
      ) : null}
    </>
  );
}
