"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatClock } from "@trackwise/shared/client";
import { Card, Field } from "@/components/ui";
import { JsonForm } from "@/components/forms";

interface TaskOpt { id: string; title: string; project: string; projectId: string }
interface Current { taskId: string; taskTitle: string; projectName: string; startedAt: string; elapsedSeconds: number }

export function TimerPanel({ tasks, initial, preselectTaskId, manualEnabled, projects, idleTimeoutMinutes }: { tasks: TaskOpt[]; initial: Current | null; preselectTaskId: string | null; manualEnabled: boolean; projects: { id: string; name: string }[]; idleTimeoutMinutes: number }) {
  const router = useRouter();
  const [current, setCurrent] = useState<Current | null>(initial);
  const [elapsed, setElapsed] = useState(initial?.elapsedSeconds ?? 0);
  const [selected, setSelected] = useState(preselectTaskId ?? tasks[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const offsetRef = useRef(0);

  // Display ticks locally but authoritative durations come from the server.
  useEffect(() => {
    if (!current) return;
    const started = new Date(current.startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() + offsetRef.current - started) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [current]);

  // Resync with the server every 30s (another device/desktop agent may have changed the timer).
  useEffect(() => {
    const sync = async () => {
      const res = await fetch("/api/timer/current").catch(() => null);
      if (!res?.ok) return;
      const data = await res.json();
      offsetRef.current = new Date(data.serverTime).getTime() - Date.now();
      setCurrent(data.timer ? { taskId: data.timer.taskId, taskTitle: data.timer.taskTitle, projectName: data.timer.projectName, startedAt: data.timer.startedAt, elapsedSeconds: data.timer.elapsedSeconds } : null);
    };
    const t = setInterval(sync, 30_000);
    return () => clearInterval(t);
  }, []);

  async function call(url: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed");
        return;
      }
      const cur = await (await fetch("/api/timer/current")).json();
      setCurrent(cur.timer ? { taskId: cur.timer.taskId, taskTitle: cur.timer.taskTitle, projectName: cur.timer.projectName, startedAt: cur.timer.startedAt, elapsedSeconds: cur.timer.elapsedSeconds } : null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const selectedTask = tasks.find((t) => t.id === selected);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className={`text-7xl font-light tabular-nums tracking-tight ${current ? "text-slate-900" : "text-slate-300"}`}>{formatClock(current ? elapsed : 0)}</div>
            {current ? (
              <div>
                <div className="text-lg font-medium">{current.taskTitle}</div>
                <div className="text-sm text-slate-500">{current.projectName} · tracking since {new Date(current.startedAt).toLocaleTimeString()}</div>
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Tracking</span>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No timer running</div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <select className="input w-72" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={tasks.length === 0}>
                {tasks.length === 0 ? <option value="">No accepted tasks</option> : tasks.map((t) => <option key={t.id} value={t.id}>{t.title} · {t.project}</option>)}
              </select>
              {current && current.taskId === selected ? (
                <button className="btn-danger" disabled={busy} onClick={() => call("/api/timer/stop")}>■ Stop</button>
              ) : (
                <button className="btn-primary" disabled={busy || !selected} onClick={() => call(current ? "/api/timer/switch" : "/api/timer/start", { taskId: selected })}>{current ? "⇄ Switch" : "▶ Start"}</button>
              )}
              {current && current.taskId !== selected ? <button className="btn-secondary" disabled={busy} onClick={() => call("/api/timer/stop")}>■ Stop current</button> : null}
            </div>
            {selectedTask && !current ? <p className="text-xs text-slate-400">Will track {selectedTask.title}</p> : null}
            {error ? <p className="rounded-sharp bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          </div>
        </Card>
        <p className="text-xs text-slate-500">Idle detection ({idleTimeoutMinutes} min) runs in the desktop agent, which asks whether to keep or discard idle time. Time is never removed automatically.</p>
      </div>
      {manualEnabled ? (
        <Card title="Add manual time">
          <JsonForm action="/api/time-entries/manual" submitLabel="Add entry" className="space-y-3" successMessage="Manual entry added">
            <Field label="Project"><select name="projectId" className="input" required>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Task (optional)"><select name="taskId" className="input"><option value="">—</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
            <Field label="Start"><input name="startedAt" type="datetime-local" className="input" required /></Field>
            <Field label="End"><input name="stoppedAt" type="datetime-local" className="input" required /></Field>
            <Field label="Reason (required)"><input name="reason" className="input" required placeholder="Forgot to start the timer" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="billable" defaultChecked /> Billable</label>
          </JsonForm>
        </Card>
      ) : (
        <Card title="Manual time"><p className="text-sm text-slate-500">Manual time is disabled for this organization.</p></Card>
      )}
    </div>
  );
}
