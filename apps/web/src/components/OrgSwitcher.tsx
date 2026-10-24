"use client";
import { useRouter } from "next/navigation";

export function OrgSwitcher({ current, organizations }: { current: string; organizations: { id: string; name: string }[] }) {
  const router = useRouter();
  return (
    <select
      aria-label="Organization"
      className="input w-auto rounded-full py-1.5 pr-8 text-sm"
      value={current}
      onChange={async (e) => {
        if (e.target.value === "__new__") {
          router.push("/settings/account#new-organization");
          return;
        }
        await fetch("/api/session/organization", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: e.target.value }) });
        router.push("/dashboard");
        router.refresh();
      }}
    >
      {organizations.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
      <option value="__new__">＋ New organization…</option>
    </select>
  );
}
