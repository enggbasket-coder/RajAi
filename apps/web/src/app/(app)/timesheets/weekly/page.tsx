import Link from "next/link";
import { MemberService, TimesheetService } from "@trackwise/core";
import { isManagerial } from "@trackwise/rbac";
import { addDays, formatDate } from "@trackwise/shared";
import { requireActor } from "@/lib/session";
import { formatDuration } from "@/lib/format";
import { ActionButton } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { EntriesTable } from "../TimesheetTable";

export const dynamic = "force-dynamic";

export default async function WeeklyTimesheet({ searchParams }: { searchParams: Promise<{ date?: string; userId?: string }> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const managerial = isManagerial(actor.role);
  const userId = managerial && sp.userId ? sp.userId : actor.userId;
  const date = sp.date ? new Date(sp.date) : new Date();
  const week = await TimesheetService.getWeek(actor, userId, date);
  const members = managerial ? await MemberService.list(actor) : [];
  const self = userId === actor.userId;
  const q = (d: Date) => `/timesheets/weekly?date=${d.toISOString().slice(0, 10)}${!self ? `&userId=${userId}` : ""}`;
  const ts = week.timesheet;
  return (
    <>
      <PageHeader
        title="Weekly timesheet"
        subtitle={<>{formatDate(week.weekStart, week.timezone)} – {formatDate(addDays(week.weekEnd, -1), week.timezone)} · <Badge value={ts.status} />{ts.reviewComment ? <span className="ml-2 text-rose-700">“{ts.reviewComment}”</span> : null}</>}
        actions={<>
          <Link href={q(addDays(week.weekStart, -7))} className="btn-secondary btn-sm">← Prev</Link>
          <Link href={q(new Date())} className="btn-secondary btn-sm">This week</Link>
          <Link href={q(addDays(week.weekStart, 7))} className="btn-secondary btn-sm">Next →</Link>
          {self && (ts.status === "DRAFT" || ts.status === "REJECTED") && week.totalSeconds > 0 ? <ActionButton action={`/api/timesheets/${ts.id}/submit`} className="btn-primary btn-sm" confirm="Submit this week for approval? Entries will be locked until reviewed.">Submit week</ActionButton> : null}
        </>}
      />
      {managerial ? (
        <form className="mb-4 flex gap-2" method="GET">
          <input type="hidden" name="date" value={week.weekStart.toISOString().slice(0, 10)} />
          <select name="userId" className="input w-auto" defaultValue={userId}>{members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select>
          <button className="btn-secondary btn-sm">View</button>
        </form>
      ) : null}
      <div className="mb-4 grid grid-cols-7 gap-2">
        {week.days.map((d) => (
          <Link key={d.key} href={`/timesheets/daily?date=${d.key}${!self ? `&userId=${userId}` : ""}`} className="card p-3 text-center hover:border-brand-300">
            <div className="text-xs uppercase text-slate-500">{new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: week.timezone }).format(d.date)}</div>
            <div className="text-sm text-slate-700">{formatDate(d.date, week.timezone).split(" ").slice(0, 2).join(" ")}</div>
            <div className={`mt-1 font-semibold ${d.totalSeconds ? "text-slate-900" : "text-slate-300"}`}>{formatDuration(d.totalSeconds)}</div>
          </Link>
        ))}
      </div>
      <div className="space-y-4">
        {week.days.filter((d) => d.entries.length).map((d) => (
          <Card key={d.key} title={<>{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: week.timezone }).format(d.date)} <span className="ml-2 font-normal text-slate-500">{formatDuration(d.totalSeconds)}</span></>}>
            <EntriesTable entries={d.entries} tz={week.timezone} editable={self} />
          </Card>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-6 text-sm">
        <div>Billable <strong>{formatDuration(week.billableSeconds)}</strong></div>
        <div>Weekly total <strong>{formatDuration(week.totalSeconds)}</strong></div>
      </div>
    </>
  );
}
