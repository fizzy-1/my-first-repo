import { Prisma } from "@prisma/client";
import type { Granularity } from "@/lib/dates";

/**
 * SQL fragments for time bucketing. Timestamp columns are stored as UTC
 * `timestamp without time zone`; they are converted to SAST wall-clock time
 * before truncation so buckets match the app's SAST period boundaries.
 * DATE columns are already calendar dates and are truncated as-is.
 */

/** A JS instant as a UTC `timestamp` literal comparable with Prisma timestamp columns. */
export function sqlTs(date: Date): Prisma.Sql {
  return Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

/** A JS calendar date (UTC midnight) as a SQL `date`. */
export function sqlDate(date: Date): Prisma.Sql {
  return Prisma.sql`(${date.toISOString().slice(0, 10)}::date)`;
}

const FORMATS: Record<Granularity, string> = { day: "YYYY-MM-DD", week: "YYYY-MM-DD", month: "YYYY-MM" };

/** Bucket key (matches `bucketKey()` in src/lib/dates.ts) for a UTC timestamp column. */
export function tsBucketKey(column: string, granularity: Granularity): Prisma.Sql {
  return Prisma.sql`to_char(date_trunc(${granularity}, (${Prisma.raw(column)} AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Johannesburg'), ${FORMATS[granularity]})`;
}

/** Bucket key for a DATE column. */
export function dateBucketKey(column: string, granularity: Granularity): Prisma.Sql {
  return Prisma.sql`to_char(date_trunc(${granularity}, ${Prisma.raw(column)}::timestamp), ${FORMATS[granularity]})`;
}

export function toMap(rows: { key: string; value: number | null }[]): Map<string, number> {
  return new Map(rows.map((r) => [r.key, Number(r.value ?? 0)]));
}
