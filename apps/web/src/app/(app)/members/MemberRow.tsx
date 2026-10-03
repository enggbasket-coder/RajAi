"use client";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";

type R = { ready: boolean; label: string };
export function MemberRow({ member, canManage, roles }: { member: { userId: string; name: string; email: string; role: string; active: boolean; preferredAssignmentChannel: string; channels: { whatsapp: R; telegram: R }; lastSeenAt: string | null }; canManage: boolean; roles: string[] }) {
  const router = useRouter();
  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/users/${member.userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) alert((await res.json()).error);
    router.refresh();
  }
  const r = (x: R) => (x.ready ? <span className="text-emerald-700">✓ Ready</span> : <span className="text-slate-400">{x.label}</span>);
  return (
    <tr className={member.active ? "" : "opacity-60"}>
      <td><div className="font-medium">{member.name}</div><div className="text-xs text-slate-500">{member.email}</div></td>
      <td>{canManage ? <select className="input w-auto py-1" value={member.role} onChange={(e) => patch({ role: e.target.value })}>{[...new Set([member.role, ...roles])].map((x) => <option key={x}>{x}</option>)}</select> : <Badge value={member.role} />}</td>
      <td>{r(member.channels.whatsapp)}</td>
      <td>{r(member.channels.telegram)}</td>
      <td>{canManage ? <select className="input w-auto py-1" value={member.preferredAssignmentChannel} onChange={(e) => patch({ preferredAssignmentChannel: e.target.value })}>{["DEFAULT", "WHATSAPP", "TELEGRAM", "BOTH"].map((x) => <option key={x}>{x}</option>)}</select> : member.preferredAssignmentChannel}</td>
      <td>{member.active ? <span className="badge bg-emerald-100 text-emerald-800">Active</span> : <span className="badge bg-slate-200 text-slate-600">Inactive</span>}</td>
      {canManage ? <td className="text-right"><button className="btn-secondary btn-sm" onClick={() => patch({ active: !member.active })}>{member.active ? "Deactivate" : "Reactivate"}</button></td> : null}
    </tr>
  );
}
