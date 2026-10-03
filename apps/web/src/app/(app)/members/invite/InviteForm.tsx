"use client";
import { useState } from "react";
import { JsonForm } from "@/components/forms";
import { Field } from "@/components/ui";

export function InviteForm({ roles }: { roles: string[] }) {
  const [url, setUrl] = useState<string | null>(null);
  return (
    <>
      <JsonForm action="/api/invitations" submitLabel="Create invitation" className="space-y-3" onSuccess={(d) => setUrl(d.url)}>
        <Field label="Email"><input name="email" type="email" className="input" required /></Field>
        <Field label="Role"><select name="role" className="input" defaultValue="EMPLOYEE">{roles.map((r) => <option key={r}>{r}</option>)}</select></Field>
      </JsonForm>
      {url ? (
        <div className="mt-4 rounded-md bg-emerald-50 p-3 text-sm">
          <div className="mb-1 font-medium text-emerald-800">Invitation link</div>
          <code className="break-all text-xs">{url}</code>
          <button className="btn-secondary btn-sm ml-2" onClick={() => navigator.clipboard.writeText(url)}>Copy</button>
        </div>
      ) : null}
    </>
  );
}
