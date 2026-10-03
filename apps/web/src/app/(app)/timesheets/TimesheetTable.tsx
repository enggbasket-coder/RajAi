import { Badge } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { formatDuration, formatTime } from "@/lib/format";

export interface EntryRow { id: string; startedAt: Date; stoppedAt: Date; durationSeconds: number; manual: boolean; manualReason: string | null; billable: boolean; status: string; project: { name: string; client: { name: string } | null }; task: { title: string } | null }

export function EntriesTable({ entries, tz, editable }: { entries: EntryRow[]; tz: string; editable: boolean }) {
  if (entries.length === 0) return <p className="py-2 text-sm text-slate-400">No time.</p>;
  return (
    <table className="table">
      <thead><tr><th>Client</th><th>Project</th><th>Task</th><th>Time</th><th>Duration</th><th>Billable</th><th>Status</th>{editable ? <th></th> : null}</tr></thead>
      <tbody>
        {entries.map((e) => {
          const canEdit = editable && (e.status === "RECORDED" || e.status === "REJECTED");
          return (
            <tr key={e.id}>
              <td className="text-slate-600">{e.project.client?.name ?? "—"}</td>
              <td>{e.project.name}</td>
              <td className="text-slate-600">{e.task?.title ?? "—"}{e.manual ? <span className="badge ml-1 bg-amber-100 text-amber-800" title={e.manualReason ?? ""}>Manual</span> : null}</td>
              <td className="text-slate-600">{formatTime(e.startedAt, tz)} – {formatTime(e.stoppedAt, tz)}</td>
              <td className="font-medium">{formatDuration(e.durationSeconds)}</td>
              <td>{e.billable ? "Yes" : "No"}</td>
              <td><Badge value={e.status} /></td>
              {editable ? (
                <td className="text-right">
                  {canEdit ? (
                    <span className="inline-flex gap-1">
                      <ActionButton action={`/api/time-entries/${e.id}`} method="PATCH" body={{ billable: !e.billable }} className="btn-secondary btn-sm">{e.billable ? "Non-billable" : "Billable"}</ActionButton>
                      <ActionButton action={`/api/time-entries/${e.id}`} method="DELETE" className="btn-secondary btn-sm" confirm="Delete this time entry?">Delete</ActionButton>
                    </span>
                  ) : <span className="text-xs text-slate-400">Locked</span>}
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
