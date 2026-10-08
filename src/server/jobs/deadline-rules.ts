import { addDays, dayKey, dbDate, startOfDay } from "@/lib/dates";

/**
 * Pure rules behind the deadline sweep (src/server/jobs/deadlines.ts): the time
 * windows it checks and the notification dedupe keys that make it idempotent.
 */

export const DUE_SOON_HOURS = 24;
export const APPROVAL_WAIT_DAYS = 3;
export const RENEWAL_NOTICE_DAYS = 30;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface DeadlineWindows {
  now: Date;
  /** Open tasks due before `now` are overdue; those due in [now, dueSoonUntil) are due soon. */
  dueSoonUntil: Date;
  /** Start of today in SAST: follow-ups scheduled before this are overdue. */
  startOfToday: Date;
  /** Start of tomorrow in SAST: follow-ups scheduled before this are due today (or overdue). */
  startOfTomorrow: Date;
  /** Pending approvals not (re)submitted since this instant have waited too long. */
  approvalCutoff: Date;
  /** Today as a calendar date (UTC midnight) for @db.Date columns. */
  today: Date;
  /** Last contract end date (inclusive, calendar date) that counts as an upcoming renewal. */
  renewalUntil: Date;
}

export function deadlineWindows(now: Date): DeadlineWindows {
  const startOfToday = startOfDay(now);
  return {
    now,
    dueSoonUntil: new Date(now.getTime() + DUE_SOON_HOURS * HOUR_MS),
    startOfToday,
    startOfTomorrow: addDays(startOfToday, 1),
    approvalCutoff: addDays(now, -APPROVAL_WAIT_DAYS),
    today: dbDate(now),
    renewalUntil: dbDate(addDays(now, RENEWAL_NOTICE_DAYS)),
  };
}

/** Whole days between two calendar dates (UTC-midnight values from @db.Date columns). */
export function calendarDaysBetween(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / DAY_MS);
}

/** "today" / "tomorrow" / "in 12 days" for a calendar date relative to today. */
export function inDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** Whole days elapsed since an instant (floor), e.g. how long an approval has waited. */
export function daysSince(instant: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - instant.getTime()) / DAY_MS));
}

/**
 * Notification dedupe keys. A (user, key) pair is only ever notified once, so
 * re-running the sweep never duplicates. Task keys match the ones the demo seed
 * writes (prisma/seed/activity.ts). Keys that embed a date fire again when that
 * date changes (a new follow-up date, an extended contract, a resubmission).
 */
export const dedupeKeys = {
  taskOverdue: (taskId: string) => `task-overdue:${taskId}`,
  taskDueSoon: (taskId: string) => `task-due:${taskId}`,
  followUpDue: (schoolId: string, followUpAt: Date) => `school-follow-up:${schoolId}:${dayKey(followUpAt)}`,
  followUpOverdue: (schoolId: string, followUpAt: Date) => `school-follow-up-overdue:${schoolId}:${dayKey(followUpAt)}`,
  approvalWaiting: (approvalId: string, waitingSince: Date) => `approval-waiting:${approvalId}:${waitingSince.toISOString()}`,
  partnershipRenewal: (partnershipId: string, endDate: Date) =>
    `partnership-renewal:${partnershipId}:${endDate.toISOString().slice(0, 10)}`,
};
