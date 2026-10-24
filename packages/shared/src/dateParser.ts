import { addDays, localDateKey, zonedParts, zonedToUtc } from "./time";

export type DateParseResult =
  | { ok: true; date: Date; hasTime: boolean }
  | { ok: false; reason: "EMPTY" | "AMBIGUOUS" | "UNRECOGNIZED"; message: string };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const DAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};

function parseTime(text: string): { hour: number; minute: number } | null | "AMBIGUOUS" {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (t === "noon") return { hour: 12, minute: 0 };
  if (t === "midnight") return { hour: 0, minute: 0 };
  if (t === "eod" || t === "end of day") return { hour: 18, minute: 0 };
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ampm = m[3];
  if (minute > 59) return null;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    if (ampm === "pm" && hour !== 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    return { hour, minute };
  }
  // "14:00" is unambiguous; a bare "5" or "5:00" without am/pm is ambiguous.
  if (hour > 23) return null;
  if (hour >= 13 || hour === 0) return { hour, minute };
  if (m[2] && hour >= 8) return { hour, minute }; // "9:30" → morning is conventional; "5:00" ambiguous
  return "AMBIGUOUS";
}

/**
 * Deterministic due-date parser. Relative words resolve in the organization timezone.
 * Supported: today, tomorrow, <weekday>, <weekday> 5pm, 12 Oct, 12 Oct 2pm, Oct 12,
 * 2026-10-12, 2026-10-12 14:00, 12/10 (rejected as ambiguous), "tomorrow before lunch" (unsupported → UNRECOGNIZED).
 */
export function parseDueDate(input: string, timeZone: string, now: Date = new Date()): DateParseResult {
  let text = (input || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return { ok: false, reason: "EMPTY", message: "No due date given." };
  text = text.replace(/^(due|by|on|at)\s+/, "").replace(/\s+at\s+/, " ");
  const todayParts = zonedParts(now, timeZone);

  const build = (y: number, mo: number, d: number, time: { hour: number; minute: number } | null, hasTime: boolean) => {
    const date = zonedToUtc(timeZone, y, mo, d, time?.hour ?? 23, time?.minute ?? 59, time ? 0 : 0);
    if (Number.isNaN(date.getTime())) return { ok: false as const, reason: "UNRECOGNIZED" as const, message: `"${input}" is not a valid date.` };
    return { ok: true as const, date, hasTime };
  };

  const splitTime = (rest: string) => {
    const r = rest.trim();
    if (!r) return { time: null as { hour: number; minute: number } | null, ambiguous: false, bad: false };
    const parsed = parseTime(r);
    if (parsed === "AMBIGUOUS") return { time: null, ambiguous: true, bad: false };
    if (!parsed) return { time: null, ambiguous: false, bad: true };
    return { time: parsed, ambiguous: false, bad: false };
  };

  const ambiguousTime = (): DateParseResult => ({
    ok: false,
    reason: "AMBIGUOUS",
    message: `Is "${input}" in the morning or afternoon? Please include am/pm or use 24h time (e.g. 14:00).`,
  });

  // ISO: 2026-10-12 [14:00]
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ t](.+))?$/.exec(text);
  if (m) {
    const { time, ambiguous, bad } = splitTime(m[4] ?? "");
    if (ambiguous) return ambiguousTime();
    if (bad) return { ok: false, reason: "UNRECOGNIZED", message: `Could not understand the time in "${input}".` };
    return build(Number(m[1]), Number(m[2]), Number(m[3]), time, !!time);
  }

  // today / tomorrow [time]
  m = /^(today|tomorrow|tmrw|tmr)(?: (.+))?$/.exec(text);
  if (m) {
    const base = m[1] === "today" ? now : addDays(now, 1);
    const p = zonedParts(base, timeZone);
    const { time, ambiguous, bad } = splitTime(m[2] ?? "");
    if (ambiguous) return ambiguousTime();
    if (bad) return { ok: false, reason: "UNRECOGNIZED", message: `Could not understand the time in "${input}".` };
    return build(p.year, p.month, p.day, time, !!time);
  }

  // weekday [time]  (next occurrence, today counts if later today is intended → use next week if same day)
  m = /^(?:next )?([a-z]+)(?: (.+))?$/.exec(text);
  if (m && DAYS[m[1]] !== undefined) {
    const target = DAYS[m[1]];
    let delta = (target - todayParts.weekday + 7) % 7;
    if (delta === 0) delta = text.startsWith("next ") ? 7 : 0;
    const base = addDays(now, delta);
    const p = zonedParts(base, timeZone);
    const { time, ambiguous, bad } = splitTime(m[2] ?? "");
    if (ambiguous) return ambiguousTime();
    if (bad) return { ok: false, reason: "UNRECOGNIZED", message: `Could not understand the time in "${input}".` };
    return build(p.year, p.month, p.day, time, !!time);
  }

  // 12 Oct [2026] [2pm]   |  Oct 12 [2026] [2pm]
  m = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)(?: (\d{4}))?(?: (.+))?$/.exec(text);
  let day: number | undefined, month: number | undefined, year: number | undefined, rest = "";
  if (m && MONTHS[m[2]]) {
    day = Number(m[1]); month = MONTHS[m[2]]; year = m[3] ? Number(m[3]) : undefined; rest = m[4] ?? "";
  } else {
    m = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?(?: (.+))?$/.exec(text);
    if (m && MONTHS[m[1]]) {
      day = Number(m[2]); month = MONTHS[m[1]]; year = m[3] ? Number(m[3]) : undefined; rest = m[4] ?? "";
    }
  }
  if (day !== undefined && month !== undefined) {
    if (day < 1 || day > 31) return { ok: false, reason: "UNRECOGNIZED", message: `"${input}" is not a valid date.` };
    const { time, ambiguous, bad } = splitTime(rest);
    if (ambiguous) return ambiguousTime();
    if (bad) return { ok: false, reason: "UNRECOGNIZED", message: `Could not understand the time in "${input}".` };
    let y = year ?? todayParts.year;
    if (!year) {
      // If that date already passed this year, assume next year.
      const candidate = zonedToUtc(timeZone, y, month, day, 23, 59);
      if (localDateKey(candidate, timeZone) < localDateKey(now, timeZone)) y += 1;
    }
    return build(y, month, day, time, !!time);
  }

  // Numeric slash forms are ambiguous (12/10 could be Dec 10 or 12 Oct).
  if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?/.test(text)) {
    return { ok: false, reason: "AMBIGUOUS", message: `"${input}" is ambiguous (day/month vs month/day). Please use "12 Oct" or 2026-10-12.` };
  }

  return { ok: false, reason: "UNRECOGNIZED", message: `Could not understand the due date "${input}". Try "tomorrow 2pm", "Friday 5pm", "12 Oct 2pm" or 2026-10-12 14:00.` };
}
