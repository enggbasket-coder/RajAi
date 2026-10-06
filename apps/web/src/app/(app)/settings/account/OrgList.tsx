"use client";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";

export function OrgList({ current, organizations }: { current: string; organizations: { id: string; name: string; role: string }[] }) {
  const router = useRouter();
  async function switchTo(id: string) {
    await fetch("/api/session/organization", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: id }) });
    router.push("/dashboard");
    router.refresh();
  }
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-slate-900">Your organizations</div>
      <ul className="divide-y divide-slate-100">
        {organizations.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-900">{o.name}</div>
              <Badge value={o.role} />
            </div>
            {o.id === current ? <span className="badge bg-slate-100 text-slate-600">Current</span> : <button className="btn-secondary btn-sm" onClick={() => switchTo(o.id)}>Switch</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
