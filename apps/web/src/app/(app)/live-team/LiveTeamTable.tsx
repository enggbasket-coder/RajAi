"use client";
import { useEffect, useState } from "react";
import { formatClock, formatDuration } from "@trackwise/shared/client";
import { Badge, Card } from "@/components/ui";

interface Row { userId: string; name: string; role: string; online: boolean; lastSeenAt: string | null; tracking: boolean; currentProject: string | null; currentTask: string | null; timerSeconds: number; hoursTodaySeconds: number; openTasks: number }

export function LiveTeamTable({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    const r = setInterval(async () => {
      const res = await fetch("/api/live-team").catch(() => null);
      if (res?.ok) setRows((await res.json()).team.map((x: any) => ({ ...x, lastSeenAt: x.lastSeenAt })));
    }, 15_000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, []);
  const [loadedAt] = useState(() => Date.now());
  const extra = Math.floor((Date.now() - loadedAt) / 1000) * 0 + tick * 0; // keep tick referenced
  return (
    <Card>
      <table className="table">
        <thead><tr><th>Employee</th><th>Status</th><th>Tracking</th><th>Current project</th><th>Current task</th><th>Timer</th><th>Hours today</th><th>Open tasks</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId}>
              <td className="font-medium">{r.name} <Badge value={r.role} className="ml-1" /></td>
              <td>{r.online ? <span className="inline-flex items-center gap-1 text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Online</span> : <span className="inline-flex items-center gap-1 text-slate-400"><span className="h-2 w-2 rounded-full bg-slate-300" /> Offline</span>}</td>
              <td>{r.tracking ? <span className="inline-flex items-center gap-1 text-emerald-700"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Tracking</span> : <span className="text-slate-400">Not tracking</span>}</td>
              <td className="text-slate-600">{r.currentProject ?? "—"}</td>
              <td className="text-slate-600">{r.currentTask ?? "—"}</td>
              <td className="font-mono tabular-nums">{r.tracking ? formatClock(r.timerSeconds + tick + extra) : "—"}</td>
              <td>{formatDuration(r.hoursTodaySeconds + (r.tracking ? tick : 0))}</td>
              <td>{r.openTasks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
