"use client";
import { useRouter } from "next/navigation";

export function OrgSwitcher({ current, organizations }: { current: string; organizations: { id: string; name: string }[] }) {
  const router = useRouter();
  if (organizations.length <= 1) return <div className="truncate text-sm font-semibold text-slate-800">{organizations[0]?.name}</div>;
  return (
    <select
      className="input py-1 text-sm"
      value={current}
      onChange={async (e) => {
        await fetch("/api/session/organization", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: e.target.value }) });
        router.refresh();
      }}
    >
      {organizations.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}
