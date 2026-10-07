/**
 * Seed utilities. All demo rows get ids prefixed "demo_" so they can be found
 * and removed later (npm run demo:remove) without touching real data.
 */
import { calendarDate } from "../../src/lib/dates";

export const DEMO_PREFIX = "demo_";

let counter = 0;
export function demoId(kind: string): string {
  counter += 1;
  return `${DEMO_PREFIX}${kind}_${counter.toString(36).padStart(5, "0")}`;
}

/** Deterministic PRNG (mulberry32) so every seed run produces identical data. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = mulberry32(20261007);

export const between = (min: number, max: number) => min + rand() * (max - min);
export const int = (min: number, max: number) => Math.floor(between(min, max + 1));
export const chance = (p: number) => rand() < p;
export const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
export const round = (n: number, step = 1) => Math.round(n / step) * step;

export function weighted<T>(entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

export const DAY = 86_400_000;
export const NOW = new Date();

export const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
export const daysFromNow = (n: number) => new Date(NOW.getTime() + n * DAY);

/** Calendar date (UTC midnight) N days from today in SAST — for @db.Date columns. */
export function dateOffset(days: number): Date {
  const shifted = new Date(NOW.getTime() + 2 * 3_600_000 + days * DAY);
  return calendarDate(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

/** A SAST wall-clock instant N days from today at hh:mm. */
export function at(days: number, hh: number, mm = 0): Date {
  const d = dateOffset(days);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh - 2, mm));
}

/** First day (calendar date) of the month that is `monthsAgo` before the current SAST month. */
export function monthStartDate(monthsAgo: number): Date {
  const today = dateOffset(0);
  return calendarDate(today.getUTCFullYear(), today.getUTCMonth() - monthsAgo, 1);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
