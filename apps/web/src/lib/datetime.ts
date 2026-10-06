/** Format a Date as the value of an <input type="datetime-local"> in the given timezone (YYYY-MM-DDTHH:mm). */
export function toLocalInputValue(date: Date | null | undefined, timeZone: string): string {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
