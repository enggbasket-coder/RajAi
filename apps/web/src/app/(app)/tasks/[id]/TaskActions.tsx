"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/forms";

export function RespondButtons({ assignmentId }: { assignmentId: string }) {
  return (
    <span className="inline-flex gap-1">
      <ActionButton action={`/api/assignments/${assignmentId}/respond`} body={{ action: "ACCEPT" }} className="btn-primary btn-sm">Accept</ActionButton>
      <ActionButton action={`/api/assignments/${assignmentId}/respond`} body={{ action: "REJECT" }} prompt={{ field: "reason", label: "Short reason for rejecting this task:" }} className="btn-secondary btn-sm">Reject</ActionButton>
    </span>
  );
}

export function AssignMoreForm({ taskId, members }: { taskId: string; members: { userId: string; name: string; wa: boolean; tg: boolean }[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [sendVia, setSendVia] = useState("PREFERENCE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (members.length === 0) return <p className="text-sm text-slate-500">Everyone is already assigned.</p>;
  return (
    <div className="space-y-2 text-sm">
      {members.map((m) => (
        <label key={m.userId} className="flex items-center gap-2">
          <input type="checkbox" checked={selected.includes(m.userId)} onChange={(e) => setSelected(e.target.checked ? [...selected, m.userId] : selected.filter((x) => x !== m.userId))} />
          {m.name}
          <span className="text-xs text-slate-400">WA {m.wa ? "✓" : "✗"} · TG {m.tg ? "✓" : "✗"}</span>
        </label>
      ))}
      <select className="input" value={sendVia} onChange={(e) => setSendVia(e.target.value)}>
        <option value="PREFERENCE">Employee preference</option><option value="WHATSAPP">WhatsApp</option><option value="TELEGRAM">Telegram</option><option value="BOTH">Both</option><option value="WEB">Web only</option>
      </select>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      <button
        className="btn-primary btn-sm"
        disabled={busy || selected.length === 0}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/tasks/${taskId}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assigneeUserIds: selected, sendVia }) });
          const data = await res.json();
          setBusy(false);
          if (!res.ok) return setError(data.error);
          setSelected([]);
          router.refresh();
        }}
      >
        {busy ? "Sending…" : "Assign & Send"}
      </button>
    </div>
  );
}
