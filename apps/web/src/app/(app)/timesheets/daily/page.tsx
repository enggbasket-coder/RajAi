import Link from "next/link";
import { MemberService, TimesheetService } from "@trackwise/core";
import { isManagerial } from "@trackwise/rbac";
import { addDays, formatDate, parseDateKey, zonedToUtc } from "@trackwise/shared";
import { prisma } from "@trackwise/database";
import { requireActor } from "@/lib/session";
import { formatDuration } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { EntriesTable } from "../TimesheetTable";

export const dynamic = "force-dynamic";

export default async function DailyTimesheet({ searchParams }: { searchParams: Promise<{ date?: string; userId?: string }> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const managerial = isManagerial(actor.role);
  const userId = managerial && sp.userId ? sp.userId : actor.userId;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
  const key = sp.date ? parseDateKey(sp.date) : null;
  const date = key ? zonedToUtc(org.timezone, key.year, key.month, key.day, 12) : new Date();
  const { day, timesheet, timezone } = await TimesheetService.getDay(actor, userId, date);
  const members = managerial ? await MemberService.list(actor) : [];
  const self = userId === actor.userId;
  const q = (d: Date) => `/timesheets/daily?date=${new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(d)}${!self ? `&userId=${userId}` : ""}`;
  return (
    <>
      <PageHeader
        title="Daily timesheet"
        subtitle={<>{new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: timezone }).format(day.date)}, {formatDate(day.date, timezone)} · week <Badge value={timesheet.status} /></>}
        actions={<>
          <Link href={q(addDays(day.date, -1))} className="btn-secondary btn-sm">← Prev</Link>
          <Link href={q(new Date())} className="btn-secondary btn-sm">Today</Link>
          <Link href={q(addDays(day.date, 1))} className="btn-secondary btn-sm">Next →</Link>
          <Link href={`/timesheets/weekly?date=${day.key}${!self ? `&userId=${userId}` : ""}`} className="btn-secondary btn-sm">Week view</Link>
          {self ? <Link href="/timer" className="btn-primary btn-sm">Add manual time</Link> : null}
        </>}
      />
      {managerial ? (
        <form className="mb-4 flex gap-2" method="GET">
          <input type="hidden" name="date" value={day.key} />
          <select name="userId" className="input w-auto" defaultValue={userId}>{members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select>
          <button className="btn-secondary btn-sm">View</button>
        </form>
      ) : null}
      <Card title={<>Entries <span className="ml-2 font-normal text-slate-500">Daily total {formatDuration(day.totalSeconds)}</span></>}>
        <EntriesTable entries={day.entries} tz={timezone} editable={self} />
      </Card>
    </>
  );
}
