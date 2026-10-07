import "server-only";
import { Prisma, type SchoolStage } from "@prisma/client";
import {
  addDays,
  addMonths,
  bucketKey,
  buckets,
  dbDate,
  differenceInDays,
  startOfDay,
  startOfMonth,
  type DateWindow,
  type Granularity,
} from "@/lib/dates";
import { formatMonthShort, formatShortDate } from "@/lib/format";
import { percentChange } from "@/lib/utils";
import { db } from "@/server/db";
import { learnerPlatform } from "@/server/integrations/learner-platform";
import { dateBucketKey, sqlDate, sqlTs, toMap } from "@/server/sql";

/**
 * Company KPIs computed from source records (learner-platform read-model,
 * finance ledger, CRM). These functions do not check permissions — callers
 * (dashboard / intelligence / finance services) gate access per widget.
 */

// ─────────────────────────── Periods ───────────────────────────

export interface Periods {
  now: Date;
  monthStart: Date;
  /** Exclusive end of "month to date" (start of tomorrow, SAST). */
  todayEnd: Date;
  prevMonthStart: Date;
  /** Same elapsed span of the previous month, for like-for-like comparison. */
  prevSamePeriodEnd: Date;
}

export function currentPeriods(now = new Date()): Periods {
  const monthStart = startOfMonth(now);
  const todayEnd = addDays(startOfDay(now), 1);
  const prevMonthStart = addMonths(monthStart, -1);
  const elapsed = differenceInDays(todayEnd, monthStart);
  const prevSame = addDays(prevMonthStart, elapsed);
  return { now, monthStart, todayEnd, prevMonthStart, prevSamePeriodEnd: prevSame < monthStart ? prevSame : monthStart };
}

export function bucketLabel(start: Date, granularity: Granularity): string {
  return granularity === "month" ? formatMonthShort(start) : formatShortDate(start);
}

export function windowBuckets(window: DateWindow) {
  const starts = buckets(window.from, window.to, window.granularity);
  return starts.map((start, i) => {
    const next = starts[i + 1] ?? (window.granularity === "month" ? addMonths(start, 1) : addDays(start, window.granularity === "week" ? 7 : 1));
    return {
      key: bucketKey(start, window.granularity),
      label: bucketLabel(start, window.granularity),
      start,
      end: next < window.to ? next : window.to,
    };
  });
}

// ─────────────────────────── Revenue ───────────────────────────

/** Recognised revenue in [from, to): subscription payments + non-cancelled income by invoice date. */
export async function revenueTotal(from: Date, to: Date) {
  const [subscription, income] = await Promise.all([
    learnerPlatform.subscriptionRevenueTotal(from, to),
    db.income.groupBy({
      by: ["category"],
      where: { status: { not: "CANCELLED" }, date: { gte: dbDate(from), lt: dbDate(to) } },
      _sum: { amount: true },
    }),
  ]);
  const school = Number(income.find((i) => i.category === "SCHOOL_CONTRACT")?._sum.amount ?? 0);
  const other = income.filter((i) => i.category !== "SCHOOL_CONTRACT").reduce((s, i) => s + Number(i._sum.amount ?? 0), 0);
  return { subscription, school, other, total: subscription + school + other };
}

export interface RevenuePoint {
  key: string;
  label: string;
  subscription: number;
  school: number;
  other: number;
  total: number;
}

export async function revenueSeries(window: DateWindow): Promise<RevenuePoint[]> {
  const bks = windowBuckets(window);
  const { granularity } = window;
  const [subs, incomeRows] = await Promise.all([
    learnerPlatform.subscriptionRevenue(window.from, window.to, granularity),
    db.$queryRaw<{ key: string; school: number; other: number }[]>(Prisma.sql`
      SELECT ${dateBucketKey('"date"', granularity)} AS key,
        COALESCE(SUM("amount") FILTER (WHERE "category" = 'SCHOOL_CONTRACT'), 0)::float AS school,
        COALESCE(SUM("amount") FILTER (WHERE "category" <> 'SCHOOL_CONTRACT'), 0)::float AS other
      FROM "Income"
      WHERE "status" <> 'CANCELLED' AND "date" >= ${sqlDate(dbDate(window.from))} AND "date" <= ${sqlDate(dbDate(window.to))}
      GROUP BY 1
    `),
  ]);
  const income = new Map(incomeRows.map((r) => [r.key, r]));
  return bks.map((b) => {
    const subscription = Math.round(subs.get(b.key) ?? 0);
    const school = Math.round(income.get(b.key)?.school ?? 0);
    const other = Math.round(income.get(b.key)?.other ?? 0);
    return { key: b.key, label: b.label, subscription, school, other, total: subscription + school + other };
  });
}

// ─────────────────────────── Expenses & cash ───────────────────────────

export async function expensesTotal(from: Date, to: Date) {
  const result = await db.expense.aggregate({
    where: { status: { in: ["APPROVED", "PAID"] }, date: { gte: dbDate(from), lt: dbDate(to) } },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

export interface CashFlowPoint {
  key: string;
  label: string;
  cashIn: number;
  cashOut: number;
  net: number;
}

/** Monthly cash movements (cash basis: payments received, income received, expenses paid). */
export async function cashFlowSeries(from: Date, to: Date, granularity: Granularity = "month"): Promise<CashFlowPoint[]> {
  const window: DateWindow = { from, to, granularity, previousFrom: from };
  const bks = windowBuckets(window);
  const [payments, income, expenses] = await Promise.all([
    learnerPlatform.subscriptionRevenue(from, to, granularity),
    db.$queryRaw<{ key: string; value: number }[]>(Prisma.sql`
      SELECT ${dateBucketKey('"receivedAt"', granularity)} AS key, SUM("amount")::float AS value
      FROM "Income" WHERE "status" = 'RECEIVED' AND "receivedAt" >= ${sqlDate(dbDate(from))} AND "receivedAt" <= ${sqlDate(dbDate(to))}
      GROUP BY 1`),
    db.$queryRaw<{ key: string; value: number }[]>(Prisma.sql`
      SELECT ${dateBucketKey('"paidAt"', granularity)} AS key, SUM("amount")::float AS value
      FROM "Expense" WHERE "status" = 'PAID' AND "paidAt" >= ${sqlDate(dbDate(from))} AND "paidAt" <= ${sqlDate(dbDate(to))}
      GROUP BY 1`),
  ]);
  const inc = toMap(income);
  const exp = toMap(expenses);
  return bks.map((b) => {
    const cashIn = Math.round((payments.get(b.key) ?? 0) + (inc.get(b.key) ?? 0));
    const cashOut = Math.round(exp.get(b.key) ?? 0);
    return { key: b.key, label: b.label, cashIn, cashOut, net: cashIn - cashOut };
  });
}

/** Cash balance at an instant: opening balances plus all cash in, minus cash out, since opening. */
export async function cashBalanceAt(at: Date): Promise<number> {
  const all = await db.cashAccount.findMany({ where: { isActive: true } });
  // Only accounts already opened at `at` contribute their opening balance.
  const accounts = all.filter((a) => a.openingDate <= dbDate(at));
  if (accounts.length === 0) return 0;
  const opening = accounts.reduce((s, a) => s + Number(a.openingBalance), 0);
  const since = all.reduce((min, a) => (a.openingDate < min ? a.openingDate : min), all[0].openingDate);
  const [row] = await db.$queryRaw<{ payments: number; income: number; expenses: number }[]>(Prisma.sql`
    SELECT
      (SELECT COALESCE(SUM("amount"), 0) FROM "Payment" WHERE "status" = 'SUCCEEDED' AND "paidAt" >= ${sqlTs(since)} AND "paidAt" < ${sqlTs(at)})::float AS payments,
      (SELECT COALESCE(SUM("amount"), 0) FROM "Income" WHERE "status" = 'RECEIVED' AND "receivedAt" >= ${sqlDate(since)} AND "receivedAt" <= ${sqlDate(dbDate(at))})::float AS income,
      (SELECT COALESCE(SUM("amount"), 0) FROM "Expense" WHERE "status" = 'PAID' AND "paidAt" >= ${sqlDate(since)} AND "paidAt" <= ${sqlDate(dbDate(at))})::float AS expenses
  `);
  return opening + row.payments + row.income - row.expenses;
}

export interface CashPosition {
  balance: number;
  previousBalance: number;
  grossBurn: number;
  netBurn: number;
  /** Months of runway at the current net burn; null when cash-flow positive. */
  runwayMonths: number | null;
}

export async function cashPosition(now = new Date()): Promise<CashPosition> {
  const monthStart = startOfMonth(now);
  const threeMonthsAgo = addMonths(monthStart, -3);
  const [balance, previousBalance, flows] = await Promise.all([
    cashBalanceAt(now),
    cashBalanceAt(addMonths(now, -1)),
    cashFlowSeries(threeMonthsAgo, new Date(monthStart.getTime() - 1)),
  ]);
  const months = flows.length || 1;
  const grossBurn = flows.reduce((s, f) => s + f.cashOut, 0) / months;
  const netBurn = flows.reduce((s, f) => s + (f.cashOut - f.cashIn), 0) / months;
  return {
    balance,
    previousBalance,
    grossBurn,
    netBurn,
    runwayMonths: netBurn > 0 ? balance / netBurn : null,
  };
}

export async function receivablesAndPayables() {
  const [ar, overdue, ap, pending] = await Promise.all([
    db.income.aggregate({ where: { status: { in: ["INVOICED", "OVERDUE"] } }, _sum: { amount: true }, _count: true }),
    db.income.aggregate({ where: { status: "OVERDUE" }, _sum: { amount: true }, _count: true }),
    db.expense.aggregate({ where: { status: "APPROVED" }, _sum: { amount: true }, _count: true }),
    db.expense.aggregate({ where: { status: "PENDING_APPROVAL" }, _sum: { amount: true }, _count: true }),
  ]);
  return {
    receivables: Number(ar._sum.amount ?? 0),
    receivablesCount: ar._count,
    overdueReceivables: Number(overdue._sum.amount ?? 0),
    overdueCount: overdue._count,
    payables: Number(ap._sum.amount ?? 0),
    payablesCount: ap._count,
    pendingApproval: Number(pending._sum.amount ?? 0),
    pendingApprovalCount: pending._count,
  };
}

// ─────────────────────────── Recurring revenue ───────────────────────────

/** Monthly value of school partnerships live at an instant. */
export async function schoolMrrAt(at: Date): Promise<number> {
  const day = dbDate(at);
  const result = await db.partnership.aggregate({
    // Expired / terminated partnerships still count for dates within their term
    // (terminations set endDate), so historical MRR stays correct.
    where: {
      status: { in: ["ACTIVE", "SIGNED", "EXPIRED", "TERMINATED"] },
      startDate: { lte: day },
      OR: [{ endDate: null }, { endDate: { gte: day } }],
    },
    _sum: { annualValue: true },
  });
  return Number(result._sum.annualValue ?? 0) / 12;
}

export async function mrrAt(at: Date) {
  const [subscription, school] = await Promise.all([learnerPlatform.subscriptionMrrAt(at), schoolMrrAt(at)]);
  return { subscription, school, total: subscription + school };
}

/** 30-day churn: paid cancellations in the window ÷ paid subscriptions live at its start. */
export async function churnRate(end: Date): Promise<number> {
  const start = addDays(end, -30);
  const [cancelled, base] = await Promise.all([learnerPlatform.cancellations(start, end), learnerPlatform.payingSubscriptionsAt(start)]);
  return base === 0 ? 0 : (cancelled / base) * 100;
}

// ─────────────────────────── Learners ───────────────────────────

export async function learnerKpis(p: Periods) {
  const [now, prev, newMtd, newPrev] = await Promise.all([
    learnerPlatform.snapshotAt(p.now),
    learnerPlatform.snapshotAt(addMonths(p.now, -1)),
    learnerPlatform.newLearners(p.monthStart, p.todayEnd),
    learnerPlatform.newLearners(p.prevMonthStart, p.prevSamePeriodEnd),
  ]);
  return {
    current: now,
    previous: prev,
    newThisMonth: newMtd,
    newSamePeriodLastMonth: newPrev,
    activeGrowth: percentChange(now.activeLearners, prev.activeLearners),
    payingGrowth: percentChange(now.payingLearners, prev.payingLearners),
  };
}

export async function learnerGrowthSeries(window: DateWindow) {
  const bks = windowBuckets(window);
  const points = await learnerPlatform.learnerSeries(bks.map((b) => ({ key: b.key, start: b.start, end: b.end })));
  const labels = new Map(bks.map((b) => [b.key, b.label]));
  return points.map((p) => ({ ...p, label: labels.get(p.key) ?? p.key }));
}

// ─────────────────────────── Schools pipeline ───────────────────────────

export const OPEN_STAGES: SchoolStage[] = ["PROSPECT", "CONTACTED", "MEETING", "PROPOSAL", "NEGOTIATION"];
export const WON_STAGES: SchoolStage[] = ["PARTNERSHIP", "ACTIVE"];

export async function schoolPipeline() {
  const rows = await db.school.groupBy({
    by: ["stage"],
    _count: true,
    _sum: { expectedAnnualValue: true, potentialLearners: true },
  });
  const weighted = await db.$queryRaw<{ stage: SchoolStage; weighted: number }[]>(Prisma.sql`
    SELECT "stage", SUM("expectedAnnualValue" * "probability" / 100.0)::float AS weighted FROM "School" GROUP BY "stage"
  `);
  const w = new Map(weighted.map((r) => [r.stage, r.weighted]));
  const byStage = new Map(rows.map((r) => [r.stage, r]));
  const stages: SchoolStage[] = [...OPEN_STAGES, ...WON_STAGES, "LOST"];
  return stages.map((stage) => ({
    stage,
    count: byStage.get(stage)?._count ?? 0,
    value: Number(byStage.get(stage)?._sum.expectedAnnualValue ?? 0),
    weighted: w.get(stage) ?? 0,
    potentialLearners: byStage.get(stage)?._sum.potentialLearners ?? 0,
  }));
}

export async function schoolKpis(p: Periods) {
  const [pipeline, activePartnerships, prevActive, newProspects] = await Promise.all([
    schoolPipeline(),
    db.partnership.count({ where: { status: "ACTIVE" } }),
    db.partnership.count({
      where: { status: { in: ["ACTIVE", "EXPIRED", "TERMINATED"] }, startDate: { lte: dbDate(addMonths(p.now, -1)) }, OR: [{ endDate: null }, { endDate: { gte: dbDate(addMonths(p.now, -1)) } }] },
    }),
    db.school.count({ where: { createdAt: { gte: p.monthStart } } }),
  ]);
  const count = (stages: SchoolStage[]) => pipeline.filter((s) => stages.includes(s.stage)).reduce((n, s) => n + s.count, 0);
  const won = count(WON_STAGES);
  const lost = count(["LOST"]);
  const open = pipeline.filter((s) => OPEN_STAGES.includes(s.stage));
  return {
    activePartnerships,
    previousActivePartnerships: prevActive,
    prospects: count(OPEN_STAGES),
    newProspects,
    won,
    lost,
    conversionRate: won + lost === 0 ? 0 : (won / (won + lost)) * 100,
    openPipelineValue: open.reduce((s, x) => s + x.value, 0),
    weightedPipelineValue: open.reduce((s, x) => s + x.weighted, 0),
    pipeline,
  };
}
