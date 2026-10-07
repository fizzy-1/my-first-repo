import { APP_TIME_ZONE } from "./dates";

/**
 * Display formatting. Uses the en-US/en-GB number & date shapes (identical across
 * Node and browser ICU builds) to avoid hydration mismatches, with SA conventions:
 * Rand prefix ("R7,500"), 24-hour clock, day-month-year dates, SAST time zone.
 */

const integerFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatZAR(value: number | null | undefined, options: { cents?: boolean; compact?: boolean } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const negative = value < 0;
  const abs = Math.abs(value);
  let body: string;
  if (options.compact && abs >= 1_000) {
    body = compactNumber(abs);
  } else {
    body = options.cents ? decimalFormat.format(abs) : integerFormat.format(Math.round(abs));
  }
  return `${negative ? "-" : ""}R${body}`;
}

function compactNumber(abs: number): string {
  const units: [number, string][] = [
    [1_000_000_000, "bn"],
    [1_000_000, "m"],
    [1_000, "k"],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = abs / size;
      const digits = scaled >= 100 ? 0 : 1;
      return `${scaled.toFixed(digits).replace(/\.0$/, "")}${suffix}`;
    }
  }
  return integerFormat.format(abs);
}

export function formatNumber(value: number | null | undefined, options: { compact?: boolean; decimals?: number } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (options.compact && Math.abs(value) >= 10_000) {
    return `${value < 0 ? "-" : ""}${compactNumber(Math.abs(value))}`;
  }
  if (options.decimals) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: options.decimals,
      maximumFractionDigits: options.decimals,
    }).format(value);
  }
  return integerFormat.format(value);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

/** "+12.4%" / "-3.0%" for growth indicators. */
export function formatDelta(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: APP_TIME_ZONE });
const shortDateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: APP_TIME_ZONE });
const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: APP_TIME_ZONE });
const monthOnlyFormat = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: APP_TIME_ZONE });
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: APP_TIME_ZONE });
const weekdayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: APP_TIME_ZONE });
const weekdayOnlyFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: APP_TIME_ZONE });

type DateInput = Date | string | null | undefined;

function toDate(value: DateInput): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "7 Oct 2026" */
export function formatDate(value: DateInput): string {
  const date = toDate(value);
  return date ? dateFormat.format(date) : "—";
}

/** "7 Oct" */
export function formatShortDate(value: DateInput): string {
  const date = toDate(value);
  return date ? shortDateFormat.format(date) : "—";
}

/** "Oct 2026" */
export function formatMonth(value: DateInput): string {
  const date = toDate(value);
  return date ? monthFormat.format(date) : "—";
}

/** "Oct" */
export function formatMonthShort(value: DateInput): string {
  const date = toDate(value);
  return date ? monthOnlyFormat.format(date) : "—";
}

/** "14:30" */
export function formatTime(value: DateInput): string {
  const date = toDate(value);
  return date ? timeFormat.format(date) : "—";
}

/** "7 Oct 2026, 14:30" */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  return date ? `${dateFormat.format(date)}, ${timeFormat.format(date)}` : "—";
}

/** "Wed, 7 Oct" */
export function formatWeekday(value: DateInput): string {
  const date = toDate(value);
  return date ? weekdayFormat.format(date) : "—";
}

/** "Wed" */
export function formatWeekdayShort(value: DateInput): string {
  const date = toDate(value);
  return date ? weekdayOnlyFormat.format(date) : "—";
}

/** "3h ago", "in 2 days", "just now". `now` is injectable for deterministic rendering. */
export function formatRelative(value: DateInput, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return "—";
  const diffMs = date.getTime() - now.getTime();
  const future = diffMs > 0;
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  let text: string;
  if (abs < minute) return "just now";
  if (abs < hour) text = `${Math.round(abs / minute)}m`;
  else if (abs < day) text = `${Math.round(abs / hour)}h`;
  else if (abs < 30 * day) {
    const days = Math.round(abs / day);
    text = `${days} day${days === 1 ? "" : "s"}`;
  } else return formatDate(date);
  return future ? `in ${text}` : `${text} ago`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatHours(hours: number): string {
  return `${hours.toFixed(hours % 1 === 0 ? 0 : 1)}h`;
}
