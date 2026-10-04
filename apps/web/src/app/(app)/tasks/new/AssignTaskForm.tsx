"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Field } from "@/components/ui";

type Readiness = { ready: boolean; label: string; detail?: string };
interface Member { userId: string; name: string; role: string; channels: { whatsapp: Readiness; telegram: Readiness }; preferred: string }
interface Project { id: string; name: string; clientId: string | null; clientName: string | null; billable: boolean }

export function AssignTaskForm({ projects, members, defaultProjectId, defaultBillable, defaultChannel, sendViaOptions }: { projects: Project[]; members: Member[]; defaultProjectId: string | null; defaultBillable: boolean; defaultChannel: string; sendViaOptions: { value: string; label: string }[] }) {
  const router = useRouter();
  const clients = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) if (p.clientId) m.set(p.clientId, p.clientName ?? "");
    return [...m.entries()];
  }, [projects]);
  const initial = projects.find((p) => p.id === defaultProjectId);
  const [clientId, setClientId] = useState<string>(initial?.clientId ?? "");
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? "");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [sendVia, setSendVia] = useState("PREFERENCE");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const visibleProjects = projects.filter((p) => !clientId || p.clientId === clientId);

  function effectiveChannels(m: Member): string[] {
    if (sendVia === "WEB") return ["WEB"];
    if (sendVia === "WHATSAPP" || sendVia === "TELEGRAM") return [sendVia];
    if (sendVia === "BOTH") return ["WHATSAPP", "TELEGRAM"];
    if (m.preferred === "BOTH") return ["WHATSAPP", "TELEGRAM"];
    if (m.preferred === "WHATSAPP" || m.preferred === "TELEGRAM") return [m.preferred];
    return [defaultChannel];
  }
  function warn(m: Member) {
    const ch = effectiveChannels(m);
    const bad = ch.filter((c) => (c === "WHATSAPP" && !m.channels.whatsapp.ready) || (c === "TELEGRAM" && !m.channels.telegram.ready));
    return bad.length ? `${bad.map((b) => (b === "WHATSAPP" ? "WhatsApp" : "Telegram")).join(" & ")} not ready` : null;
  }

  async function submit(intent: "assign" | "draft", form: HTMLFormElement) {
    setBusy(true);
    setError(null);
    const fd = new FormData(form);
    const body = {
      projectId,
      title: fd.get("title"),
      description: fd.get("description") || null,
      dueAt: fd.get("dueAt") || null,
      estimatedMinutes: fd.get("estimateHours") ? Math.round(Number(fd.get("estimateHours")) * 60) : null,
      priority: fd.get("priority"),
      billable: fd.get("billable") === "on",
      assigneeUserIds: assignees,
      sendVia,
      intent,
    };
    try {
      const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed");
        return;
      }
      setResult(data);
      router.push(`/tasks/${data.task.id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const intent = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value === "draft" ? "draft" : "assign";
        void submit(intent, e.currentTarget);
      }}
      className="grid gap-6 lg:grid-cols-3"
    >
      <div className="space-y-6 lg:col-span-2">
        <Card title="Task">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Client">
              <select className="input" value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId(""); }}>
                <option value="">All clients</option>
                {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </Field>
            <Field label="Project">
              <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
                <option value="">Select project…</option>
                {visibleProjects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.clientName ? ` · ${p.clientName}` : ""}</option>)}
              </select>
            </Field>
            <div className="md:col-span-2"><Field label="Task title"><input name="title" className="input" required placeholder="Finish Act 2 keyframes" /></Field></div>
            <div className="md:col-span-2"><Field label="Description / note"><textarea name="description" className="input" rows={3} placeholder="Please complete the remaining animation frames." /></Field></div>
            <Field label="Due date/time"><input name="dueAt" type="datetime-local" className="input" /></Field>
            <Field label="Estimate (hours)"><input name="estimateHours" type="number" step="0.25" min="0" className="input" placeholder="3" /></Field>
            <Field label="Priority">
              <select name="priority" className="input" defaultValue="NORMAL">{["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => <option key={p}>{p}</option>)}</select>
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="billable" defaultChecked={projects.find((p) => p.id === projectId)?.billable ?? defaultBillable} /> Billable</label>
          </div>
        </Card>
        <Card title="Assignees" actions={<span className="text-xs text-slate-500">{assignees.length} selected</span>}>
          <table className="table">
            <thead><tr><th></th><th>Employee</th><th>WhatsApp</th><th>Telegram</th><th>Preference</th><th>Will send via</th></tr></thead>
            <tbody>
              {members.map((m) => {
                const checked = assignees.includes(m.userId);
                const w = checked ? warn(m) : null;
                return (
                  <tr key={m.userId} className={checked ? "bg-brand-50/40" : ""}>
                    <td><input type="checkbox" checked={checked} onChange={(e) => setAssignees(e.target.checked ? [...assignees, m.userId] : assignees.filter((x) => x !== m.userId))} /></td>
                    <td className="font-medium">{m.name}<span className="ml-1 text-xs text-slate-400">{m.role.toLowerCase()}</span></td>
                    <td title={m.channels.whatsapp.detail}>{m.channels.whatsapp.ready ? <span className="text-emerald-700">✓</span> : <span className="text-slate-400">{m.channels.whatsapp.label}</span>}</td>
                    <td title={m.channels.telegram.detail}>{m.channels.telegram.ready ? <span className="text-emerald-700">✓</span> : <span className="text-slate-400">{m.channels.telegram.label}</span>}</td>
                    <td className="text-slate-500">{m.preferred === "DEFAULT" ? `Default (${defaultChannel})` : m.preferred}</td>
                    <td className="text-xs">{effectiveChannels(m).join(" + ")}{w ? <span className="ml-1 text-rose-600">· {w}</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
      <div className="space-y-6">
        <Card title="Send via">
          <div className="space-y-2">
            {sendViaOptions.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input type="radio" name="sendVia" value={o.value} checked={sendVia === o.value} onChange={() => setSendVia(o.value)} /> {o.label}
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Channels that are not ready fail with a clear reason and can be retried from the task page. Fallback to the other channel only happens if the organization allows it.</p>
          {error ? <p className="mt-3 rounded-sharp bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          <div className="mt-4 flex flex-col gap-2">
            <button type="submit" name="intent" value="assign" className="btn-primary" disabled={busy || !projectId || assignees.length === 0}>{busy ? "Sending…" : "Assign & Send"}</button>
            <button type="submit" name="intent" value="draft" className="btn-secondary" disabled={busy || !projectId}>Save Draft</button>
          </div>
          {result ? <pre className="mt-3 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(result.sends, null, 1)}</pre> : null}
        </Card>
      </div>
    </form>
  );
}
