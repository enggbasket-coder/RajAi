import { describe, expect, it } from "vitest";
import { normalizePhone, parseAssignCommandSync, parseAssignmentReply, parseDueDate } from "@trackwise/shared";

const TZ = "Asia/Kolkata";
const now = new Date("2026-10-03T06:00:00Z"); // Saturday 11:30 IST

describe("date parser", () => {
  const local = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  it("handles relative and absolute forms in the org timezone", () => {
    const t = parseDueDate("tomorrow 2pm", TZ, now);
    expect(t.ok && local(t.date)).toBe("2026-10-04, 14:00");
    const fri = parseDueDate("Friday 5pm", TZ, now);
    expect(fri.ok && local(fri.date)).toBe("2026-10-09, 17:00");
    const oct = parseDueDate("12 Oct", TZ, now);
    expect(oct.ok && local(oct.date)).toBe("2026-10-12, 23:59");
    const iso = parseDueDate("2026-10-12 14:00", TZ, now);
    expect(iso.ok && local(iso.date)).toBe("2026-10-12, 14:00");
    const today = parseDueDate("today", TZ, now);
    expect(today.ok && local(today.date)).toBe("2026-10-03, 23:59");
    const mon = parseDueDate("Monday", TZ, now);
    expect(mon.ok && local(mon.date)).toBe("2026-10-05, 23:59");
  });
  it("never guesses ambiguous input", () => {
    expect(parseDueDate("12/10", TZ, now)).toMatchObject({ ok: false, reason: "AMBIGUOUS" });
    expect(parseDueDate("tomorrow 5", TZ, now)).toMatchObject({ ok: false, reason: "AMBIGUOUS" });
    expect(parseDueDate("before lunch", TZ, now)).toMatchObject({ ok: false, reason: "UNRECOGNIZED" });
  });
});

describe("command parser", () => {
  it("parses the assign syntax with and without slash / due", () => {
    expect(parseAssignCommandSync("assign Akhil | EdgeVerve Q2O | Finish Act 2 keyframes | due tomorrow 2pm")).toMatchObject({ employee: "Akhil", project: "EdgeVerve Q2O", title: "Finish Act 2 keyframes", due: "tomorrow 2pm" });
    expect(parseAssignCommandSync("/assign Akhil | EVQ2O | Fix bug")).toMatchObject({ employee: "Akhil", project: "EVQ2O", title: "Fix bug", due: null });
    expect(parseAssignCommandSync("assign Akhil | only two")).toMatchObject({ error: expect.stringContaining("Format") });
    expect(parseAssignCommandSync("hello")).toBeNull();
  });
});

describe("reply parser & phone", () => {
  it("normalizes replies", () => {
    for (const t of ["1", " Accept ", "ACCEPTED", "yes."]) expect(parseAssignmentReply(t)).toBe("ACCEPT");
    for (const t of ["2", "reject", "Rejected", "No"]) expect(parseAssignmentReply(t)).toBe("REJECT");
    expect(parseAssignmentReply("maybe")).toBe("UNKNOWN");
  });
  it("normalizes phones to E.164", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizePhone("919876543210")).toBe("+919876543210");
    expect(normalizePhone("98765 43210", "91")).toBe("+919876543210");
    expect(normalizePhone("abc")).toBeNull();
  });
});
