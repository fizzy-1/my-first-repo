import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addMonths,
  bucketKey,
  buckets,
  dayKey,
  dbDate,
  endOfDay,
  endOfMonth,
  endOfSastDay,
  monthKey,
  parseDateInput,
  parseDateTimeInput,
  parseRange,
  quarterOf,
  resolveRange,
  sastYear,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  toDateInput,
  toDateTimeInput,
} from "./dates";

// SAST is UTC+02:00 all year, so SAST midnight is 22:00 UTC on the previous day.
const at = (iso: string) => new Date(iso);
const iso = (d: Date) => d.toISOString();

describe("SAST day boundaries", () => {
  it("rolls over at SAST midnight, not UTC midnight", () => {
    // 23:59:59.999 SAST on 7 Oct
    assert.equal(iso(startOfDay(at("2026-10-07T21:59:59.999Z"))), "2026-10-06T22:00:00.000Z");
    assert.equal(dayKey(at("2026-10-07T21:59:59.999Z")), "2026-10-07");
    // 00:00 SAST on 8 Oct
    assert.equal(iso(startOfDay(at("2026-10-07T22:00:00.000Z"))), "2026-10-07T22:00:00.000Z");
    assert.equal(dayKey(at("2026-10-07T22:00:00.000Z")), "2026-10-08");
  });

  it("ends the day one millisecond before the next SAST midnight", () => {
    assert.equal(iso(endOfDay(at("2026-10-08T10:00:00Z"))), "2026-10-08T21:59:59.999Z");
  });

  it("starts weeks on Monday in SAST", () => {
    // Thursday 8 Oct 2026 → Monday 5 Oct
    assert.equal(iso(startOfWeek(at("2026-10-08T10:00:00Z"))), "2026-10-04T22:00:00.000Z");
    // Sunday 11 Oct, 23:30 SAST still belongs to the week of 5 Oct…
    assert.equal(iso(startOfWeek(at("2026-10-11T21:30:00Z"))), "2026-10-04T22:00:00.000Z");
    // …and Monday 12 Oct, 00:30 SAST starts the next one.
    assert.equal(iso(startOfWeek(at("2026-10-11T22:30:00Z"))), "2026-10-11T22:00:00.000Z");
  });
});

describe("SAST month, quarter and year boundaries", () => {
  it("assigns the last SAST minutes of a month to that month", () => {
    const lastMinute = at("2026-09-30T21:59:00Z"); // 23:59 SAST, 30 Sep
    assert.equal(monthKey(lastMinute), "2026-09");
    assert.equal(iso(startOfMonth(lastMinute)), "2026-08-31T22:00:00.000Z");
    assert.equal(iso(endOfMonth(lastMinute)), "2026-09-30T21:59:59.999Z");
  });

  it("starts the next month at SAST midnight even though it is still the previous day in UTC", () => {
    const firstMinute = at("2026-09-30T22:30:00Z"); // 00:30 SAST, 1 Oct
    assert.equal(monthKey(firstMinute), "2026-10");
    assert.equal(iso(startOfMonth(firstMinute)), "2026-09-30T22:00:00.000Z");
  });

  it("switches quarter at SAST midnight", () => {
    assert.equal(quarterOf(at("2026-09-30T21:30:00Z")), 3);
    assert.equal(iso(startOfQuarter(at("2026-09-30T21:30:00Z"))), "2026-06-30T22:00:00.000Z");
    assert.equal(quarterOf(at("2026-09-30T22:30:00Z")), 4);
    assert.equal(iso(startOfQuarter(at("2026-09-30T22:30:00Z"))), "2026-09-30T22:00:00.000Z");
    assert.equal(quarterOf(at("2026-01-15T10:00:00Z")), 1);
  });

  it("switches year at SAST midnight on 1 January", () => {
    const newYear = at("2025-12-31T22:30:00Z"); // 00:30 SAST, 1 Jan 2026
    assert.equal(sastYear(newYear), 2026);
    assert.equal(iso(startOfYear(newYear)), "2025-12-31T22:00:00.000Z");
    assert.equal(sastYear(at("2025-12-31T21:30:00Z")), 2025);
  });
});

describe("calendar dates for @db.Date columns", () => {
  it("dbDate stores the SAST calendar day as UTC midnight", () => {
    assert.equal(iso(dbDate(at("2026-10-07T22:30:00Z"))), "2026-10-08T00:00:00.000Z"); // 00:30 SAST, 8 Oct
    assert.equal(iso(dbDate(at("2026-10-07T21:30:00Z"))), "2026-10-07T00:00:00.000Z"); // 23:30 SAST, 7 Oct
    assert.equal(iso(dbDate(at("2026-10-08T00:00:00Z"))), "2026-10-08T00:00:00.000Z"); // already a calendar date
  });

  it("round-trips <input type=date> values through parseDateInput and toDateInput", () => {
    for (const value of ["2026-01-01", "2026-02-28", "2024-02-29", "2026-10-08", "2026-12-31"]) {
      const date = parseDateInput(value);
      assert.ok(date, value);
      assert.equal(iso(date), `${value}T00:00:00.000Z`);
      assert.equal(toDateInput(date), value);
    }
    assert.equal(toDateInput(null), "");
  });

  it("rejects impossible days and malformed date input", () => {
    for (const value of ["2026-02-30", "2025-02-29", "2026-04-31", "26-1-1", "2026/10/08", "2026-10-08T00:00", ""]) {
      assert.equal(parseDateInput(value), null, value);
    }
  });

  // Known bug: only the day is checked for overflow, so "2026-13-01" parses as 1 Jan 2027.
  it("rejects out-of-range months", () => {
    for (const value of ["2026-13-01", "2026-00-10", "2026-99-01"]) {
      assert.equal(parseDateInput(value), null, value);
    }
  });

  it("endOfSastDay gives the last instant of the calendar day in SAST", () => {
    assert.equal(iso(endOfSastDay(parseDateInput("2026-10-08")!)), "2026-10-08T21:59:59.999Z");
  });

  it("round-trips <input type=datetime-local> values as SAST wall-clock time", () => {
    const date = parseDateTimeInput("2026-10-08T07:30");
    assert.ok(date);
    assert.equal(iso(date), "2026-10-08T05:30:00.000Z");
    assert.equal(toDateTimeInput(date), "2026-10-08T07:30");
    assert.equal(parseDateTimeInput("not a date"), null);
    // Out-of-range parts are rejected, not rolled over.
    assert.equal(parseDateTimeInput("2026-13-01T09:00"), null);
    assert.equal(parseDateTimeInput("2026-02-30T09:00"), null);
    assert.equal(parseDateTimeInput("2026-10-08T25:00"), null);
    assert.equal(parseDateTimeInput("2026-10-08T09:60"), null);
  });
});

describe("addMonths", () => {
  const sast = (y: number, m: number, d: number, h = 10) => new Date(Date.UTC(y, m - 1, d, h - 2));

  it("clamps to the last day of shorter months", () => {
    assert.equal(dayKey(addMonths(sast(2026, 1, 31), 1)), "2026-02-28");
    assert.equal(dayKey(addMonths(sast(2024, 1, 31), 1)), "2024-02-29");
    assert.equal(dayKey(addMonths(sast(2026, 3, 31), -1)), "2026-02-28");
    assert.equal(dayKey(addMonths(sast(2026, 8, 31), 1)), "2026-09-30");
  });

  it("crosses year boundaries in both directions", () => {
    assert.equal(dayKey(addMonths(sast(2026, 12, 31), 2)), "2027-02-28");
    assert.equal(dayKey(addMonths(sast(2026, 1, 15), -1)), "2025-12-15");
    assert.equal(dayKey(addMonths(sast(2026, 10, 8), -12)), "2025-10-08");
  });

  it("keeps the SAST time of day", () => {
    const result = addMonths(sast(2026, 1, 31, 23), 1); // 23:00 SAST
    assert.equal(iso(result), "2026-02-28T21:00:00.000Z");
  });
});

describe("resolveRange", () => {
  const now = at("2026-10-08T10:00:00Z"); // Thursday 8 Oct 2026, 12:00 SAST

  it("7d covers today and the six SAST days before it, daily", () => {
    const w = resolveRange("7d", now);
    assert.equal(iso(w.from), "2026-10-01T22:00:00.000Z"); // 2 Oct 00:00 SAST
    assert.equal(w.to, now);
    assert.equal(w.granularity, "day");
    assert.equal(buckets(w.from, w.to, w.granularity).length, 7);
  });

  it("3m starts on the Monday of the week three months back, weekly", () => {
    const w = resolveRange("3m", now);
    assert.equal(iso(w.from), "2026-07-05T22:00:00.000Z"); // Monday 6 Jul
    assert.equal(w.granularity, "week");
  });

  it("6m and 12m start at the beginning of a SAST month, monthly", () => {
    const six = resolveRange("6m", now);
    assert.equal(iso(six.from), "2026-04-30T22:00:00.000Z"); // 1 May
    assert.equal(six.granularity, "month");
    const twelve = resolveRange("12m", now);
    assert.equal(iso(twelve.from), "2025-10-31T22:00:00.000Z"); // 1 Nov 2025
    const keys = buckets(twelve.from, twelve.to, "month").map((b) => bucketKey(b, "month"));
    assert.equal(keys.length, 12);
    assert.equal(keys[0], "2025-11");
    assert.equal(keys[11], "2026-10");
  });

  it("previousFrom is the equally long window immediately before", () => {
    const w = resolveRange("30d", now);
    assert.equal(w.from.getTime() - w.previousFrom.getTime(), w.to.getTime() - w.from.getTime());
  });

  it("parseRange falls back for unknown values", () => {
    assert.equal(parseRange("6m"), "6m");
    assert.equal(parseRange(["7d", "12m"]), "7d");
    assert.equal(parseRange("forever"), "12m");
    assert.equal(parseRange(undefined, "30d"), "30d");
  });
});
