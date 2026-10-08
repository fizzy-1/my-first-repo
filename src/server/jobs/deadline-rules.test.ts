import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarDaysBetween, daysSince, deadlineWindows, dedupeKeys, inDays } from "./deadline-rules";

const iso = (d: Date) => d.toISOString();

describe("deadlineWindows", () => {
  it("uses the SAST day just after midnight", () => {
    const w = deadlineWindows(new Date("2026-10-08T22:30:00Z")); // 00:30 SAST, Fri 9 Oct
    assert.equal(iso(w.startOfToday), "2026-10-08T22:00:00.000Z");
    assert.equal(iso(w.startOfTomorrow), "2026-10-09T22:00:00.000Z");
    assert.equal(iso(w.today), "2026-10-09T00:00:00.000Z");
    assert.equal(iso(w.renewalUntil), "2026-11-08T00:00:00.000Z");
  });

  it("uses the SAST day just before midnight", () => {
    const w = deadlineWindows(new Date("2026-10-08T21:30:00Z")); // 23:30 SAST, Thu 8 Oct
    assert.equal(iso(w.startOfToday), "2026-10-07T22:00:00.000Z");
    assert.equal(iso(w.today), "2026-10-08T00:00:00.000Z");
  });

  it("looks 24 hours ahead for due-soon tasks and 3 days back for stale approvals", () => {
    const now = new Date("2026-10-08T10:00:00Z");
    const w = deadlineWindows(now);
    assert.equal(iso(w.dueSoonUntil), "2026-10-09T10:00:00.000Z");
    assert.equal(iso(w.approvalCutoff), "2026-10-05T10:00:00.000Z");
  });

  it("treats a task due at the end of today as due soon from the start of the day", () => {
    // Form due dates are stored as the end of the SAST day (23:59:59.999).
    const dueEndOfToday = new Date("2026-10-08T21:59:59.999Z");
    const w = deadlineWindows(new Date("2026-10-07T22:00:00Z")); // 00:00 SAST, 8 Oct
    assert.ok(dueEndOfToday >= w.now && dueEndOfToday < w.dueSoonUntil);
  });
});

describe("day arithmetic", () => {
  it("counts whole calendar days between @db.Date values", () => {
    assert.equal(calendarDaysBetween(new Date("2026-10-18T00:00:00Z"), new Date("2026-10-08T00:00:00Z")), 10);
    assert.equal(calendarDaysBetween(new Date("2026-10-08T00:00:00Z"), new Date("2026-10-08T00:00:00Z")), 0);
  });

  it("describes days ahead in words", () => {
    assert.equal(inDays(0), "today");
    assert.equal(inDays(1), "tomorrow");
    assert.equal(inDays(12), "in 12 days");
  });

  it("floors elapsed days and never goes negative", () => {
    const now = new Date("2026-10-08T10:00:00Z");
    assert.equal(daysSince(new Date("2026-10-04T11:00:00Z"), now), 3);
    assert.equal(daysSince(new Date("2026-10-04T10:00:00Z"), now), 4);
    assert.equal(daysSince(new Date("2026-10-09T10:00:00Z"), now), 0);
  });
});

describe("dedupeKeys", () => {
  it("matches the task keys written by the demo seed", () => {
    assert.equal(dedupeKeys.taskOverdue("task_1"), "task-overdue:task_1");
    assert.equal(dedupeKeys.taskDueSoon("task_1"), "task-due:task_1");
  });

  it("keys follow-ups by the SAST date, separately for due and overdue", () => {
    const endOfDay = new Date("2026-10-08T21:59:59.999Z"); // 23:59:59.999 SAST, 8 Oct
    assert.equal(dedupeKeys.followUpDue("sch_1", endOfDay), "school-follow-up:sch_1:2026-10-08");
    assert.equal(dedupeKeys.followUpOverdue("sch_1", endOfDay), "school-follow-up-overdue:sch_1:2026-10-08");
    assert.equal(dedupeKeys.followUpDue("sch_1", new Date("2026-10-08T22:30:00Z")), "school-follow-up:sch_1:2026-10-09");
  });

  it("changes when the underlying date changes, so new deadlines notify again", () => {
    const first = dedupeKeys.partnershipRenewal("prt_1", new Date("2026-11-01T00:00:00Z"));
    const extended = dedupeKeys.partnershipRenewal("prt_1", new Date("2027-11-01T00:00:00Z"));
    assert.equal(first, "partnership-renewal:prt_1:2026-11-01");
    assert.notEqual(first, extended);
    assert.notEqual(
      dedupeKeys.approvalWaiting("apr_1", new Date("2026-10-01T08:00:00Z")),
      dedupeKeys.approvalWaiting("apr_1", new Date("2026-10-06T08:00:00Z")),
    );
  });
});
