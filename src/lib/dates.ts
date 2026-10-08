/**
 * Date helpers pinned to South African Standard Time (SAST, UTC+02:00).
 *
 * South Africa does not observe daylight saving, so SAST is a fixed offset.
 * All period boundaries (day / week / month) are computed in SAST regardless of
 * the server's own TZ setting, so "this month" means the same thing on every
 * machine. SQL bucketing uses the matching `AT TIME ZONE 'Africa/Johannesburg'`.
 */

export const APP_TIME_ZONE = "Africa/Johannesburg";
const OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Wall-clock parts of an instant as seen in SAST. */
function sastParts(date: Date) {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/** Instant at which the given SAST wall-clock date starts. */
export function sastDate(year: number, month: number, day = 1): Date {
  return new Date(Date.UTC(year, month, day) - OFFSET_MS);
}

export function startOfDay(date: Date): Date {
  const p = sastParts(date);
  return sastDate(p.year, p.month, p.day);
}

export function endOfDay(date: Date): Date {
  return new Date(startOfDay(date).getTime() + DAY_MS - 1);
}

/** Monday-based week start (ISO weeks). */
export function startOfWeek(date: Date): Date {
  const p = sastParts(date);
  const diff = (p.weekday + 6) % 7;
  return sastDate(p.year, p.month, p.day - diff);
}

export function startOfMonth(date: Date): Date {
  const p = sastParts(date);
  return sastDate(p.year, p.month, 1);
}

export function endOfMonth(date: Date): Date {
  const p = sastParts(date);
  return new Date(sastDate(p.year, p.month + 1, 1).getTime() - 1);
}

export function startOfQuarter(date: Date): Date {
  const p = sastParts(date);
  return sastDate(p.year, Math.floor(p.month / 3) * 3, 1);
}

export function startOfYear(date: Date): Date {
  return sastDate(sastParts(date).year, 0, 1);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Adds calendar months in SAST, clamping the day (31 Jan + 1 month → 28/29 Feb). */
export function addMonths(date: Date, months: number): Date {
  const p = sastParts(date);
  const timeOfDay = date.getTime() - sastDate(p.year, p.month, p.day).getTime();
  const target = sastDate(p.year, p.month + months, 1);
  const tp = sastParts(target);
  const daysInTarget = sastParts(new Date(sastDate(tp.year, tp.month + 1, 1).getTime() - 1)).day;
  return new Date(sastDate(tp.year, tp.month, Math.min(p.day, daysInTarget)).getTime() + timeOfDay);
}

export function differenceInDays(later: Date, earlier: Date): number {
  return Math.round((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / DAY_MS);
}

export function sastYear(date: Date): number {
  return sastParts(date).year;
}

/** 1-based quarter of the SAST date. */
export function quarterOf(date: Date): number {
  return Math.floor(sastParts(date).month / 3) + 1;
}

/** "2026-10" style key in SAST. */
export function monthKey(date: Date): string {
  const p = sastParts(date);
  return `${p.year}-${String(p.month + 1).padStart(2, "0")}`;
}

/** "2026-10-07" style key in SAST. */
export function dayKey(date: Date): string {
  const p = sastParts(date);
  return `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * Calendar-date values for `@db.Date` columns.
 *
 * PostgreSQL DATE columns keep only the *UTC* calendar day of the value Prisma
 * sends, so date-only values are represented as UTC midnight of the intended
 * (SAST) calendar day. Use `dbDate()` whenever filtering or writing a DATE
 * column from an instant; never pass SAST-midnight instants (they would land
 * on the previous day).
 */
export function dbDate(instant: Date): Date {
  const p = sastParts(instant);
  return new Date(Date.UTC(p.year, p.month, p.day));
}

/** UTC-midnight calendar date for a given year / month (0-based) / day. */
export function calendarDate(year: number, month: number, day = 1): Date {
  return new Date(Date.UTC(year, month, day));
}

/** End of the SAST day for a calendar date (for "due by" timestamps). */
export function endOfSastDay(calendar: Date): Date {
  return new Date(
    Date.UTC(calendar.getUTCFullYear(), calendar.getUTCMonth(), calendar.getUTCDate() + 1) - OFFSET_MS - 1,
  );
}

/** Parses a "YYYY-MM-DD" form value into a calendar date (UTC midnight, for DATE columns). */
export function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  // Reject impossible dates (2026-13-01, 2026-02-30) instead of letting Date roll them over.
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null;
  return date;
}

/** Parses a "YYYY-MM-DDTHH:mm" form value as SAST wall-clock time. */
export function parseDateTimeInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  const wall = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)));
  // Reject out-of-range parts (month 13, 30 Feb, 25:00) rather than rolling them over.
  if (
    Number.isNaN(wall.getTime()) ||
    wall.getUTCFullYear() !== Number(y) ||
    wall.getUTCMonth() !== Number(m) - 1 ||
    wall.getUTCDate() !== Number(d) ||
    wall.getUTCHours() !== Number(hh) ||
    wall.getUTCMinutes() !== Number(mm)
  ) {
    return null;
  }
  return new Date(wall.getTime() - OFFSET_MS);
}

/** Formats an instant as a "YYYY-MM-DD" value for <input type="date">. */
export function toDateInput(date: Date | null | undefined): string {
  return date ? dayKey(date) : "";
}

/** Formats an instant as a "YYYY-MM-DDTHH:mm" value for <input type="datetime-local">. */
export function toDateTimeInput(date: Date | null | undefined): string {
  if (!date) return "";
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return shifted.toISOString().slice(0, 16);
}

export type RangeKey = "7d" | "30d" | "3m" | "6m" | "12m";
export type Granularity = "day" | "week" | "month";

export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
];

export function parseRange(value: string | string[] | undefined, fallback: RangeKey = "12m"): RangeKey {
  const v = Array.isArray(value) ? value[0] : value;
  return RANGE_OPTIONS.some((o) => o.value === v) ? (v as RangeKey) : fallback;
}

export interface DateWindow {
  from: Date;
  to: Date;
  granularity: Granularity;
  /** The equally long window immediately before this one. */
  previousFrom: Date;
}

/** Resolves a range key into a reporting window ending now. */
export function resolveRange(range: RangeKey, now = new Date()): DateWindow {
  const to = now;
  let from: Date;
  let granularity: Granularity;
  switch (range) {
    case "7d":
      from = startOfDay(addDays(now, -6));
      granularity = "day";
      break;
    case "30d":
      from = startOfDay(addDays(now, -29));
      granularity = "day";
      break;
    case "3m":
      from = startOfWeek(addMonths(now, -3));
      granularity = "week";
      break;
    case "6m":
      from = startOfMonth(addMonths(now, -5));
      granularity = "month";
      break;
    case "12m":
    default:
      from = startOfMonth(addMonths(now, -11));
      granularity = "month";
      break;
  }
  const length = to.getTime() - from.getTime();
  return { from, to, granularity, previousFrom: new Date(from.getTime() - length) };
}

/** Bucket start instants covering [from, to] at the given granularity. */
export function buckets(from: Date, to: Date, granularity: Granularity): Date[] {
  const result: Date[] = [];
  let cursor =
    granularity === "day" ? startOfDay(from) : granularity === "week" ? startOfWeek(from) : startOfMonth(from);
  while (cursor.getTime() <= to.getTime()) {
    result.push(cursor);
    cursor = granularity === "day" ? addDays(cursor, 1) : granularity === "week" ? addDays(cursor, 7) : addMonths(cursor, 1);
  }
  return result;
}

export function bucketKey(date: Date, granularity: Granularity): string {
  if (granularity === "month") return monthKey(date);
  if (granularity === "week") return dayKey(startOfWeek(date));
  return dayKey(date);
}
