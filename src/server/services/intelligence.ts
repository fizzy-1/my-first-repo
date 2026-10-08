import "server-only";
import { Prisma, type CampaignChannel, type CampaignStatus, type ContentType, type ExpenseCategory, type Province, type TutorActivity } from "@prisma/client";
import { addDays, dbDate, startOfDay, type DateWindow } from "@/lib/dates";
import { CAMPAIGN_CHANNEL, CONTENT_TYPE, PROVINCE, SCHOOL_STAGE, TUTOR_ACTIVITY } from "@/lib/labels";
import { formatShortDate } from "@/lib/format";
import { percentChange } from "@/lib/utils";
import { assertCan, can, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { learnerPlatform } from "@/server/integrations/learner-platform";
import { dateBucketKey, sqlDate, sqlTs, tsBucketKey } from "@/server/sql";
import { expensesByCategory } from "./finance";
import {
  OPEN_STAGES,
  WON_STAGES,
  cashBalanceAt,
  cashFlowSeries,
  cashPosition,
  churnRate,
  currentPeriods,
  learnerGrowthSeries,
  mrrAt,
  revenueSeries,
  revenueTotal,
  schoolKpis,
  schoolMrrAt,
  windowBuckets,
} from "./metrics";
import { upcomingRenewals } from "./schools";

/**
 * Business Intelligence: period analytics for the /intelligence tabs.
 *
 * KPIs are computed by the shared metric functions (metrics.ts, the learner
 * platform source, finance / schools services); only aggregates nothing else
 * provides are queried here. Every section is gated server-side on the module
 * permission that owns its data — finance figures on finance.read, school data
 * on schools.read, campaigns on marketing.read, academic data on academic.read
 * and learner metrics on dashboard.executive.
 */

export function intelligenceAccess(user: SessionUser) {
  return {
    learners: can(user, "dashboard.executive"),
    finance: can(user, "finance.read"),
    schools: can(user, "schools.read"),
    marketing: can(user, "marketing.read"),
    academic: can(user, "academic.read"),
  };
}

export type IntelligenceAccess = ReturnType<typeof intelligenceAccess>;

export interface Comparison {
  value: number;
  previous: number;
  /** Percentage change vs `previous`; null when the previous value is zero. */
  delta: number | null;
}

function compare(value: number, previous: number): Comparison {
  return { value, previous, delta: percentChange(value, previous) };
}

/**
 * Flow totals cover the window through the end of today; the comparison period
 * is the equally long span (same number of SAST days) immediately before it.
 * Stock figures (MRR, learners, cash) compare the value now with the value at
 * the start of the window.
 */
function periodOf(window: DateWindow) {
  const end = addDays(startOfDay(window.to), 1);
  const span = end.getTime() - window.from.getTime();
  return { from: window.from, end, prevFrom: new Date(window.from.getTime() - span), prevEnd: window.from };
}

const none = Promise.resolve(null);

// ─────────────────────────── Overview ───────────────────────────

export async function intelligenceOverview(user: SessionUser, window: DateWindow) {
  assertCan(user, "intelligence.read");
  const access = intelligenceAccess(user);
  const p = periodOf(window);
  const [revenue, revenuePrev, mrrNow, mrrStart, learnersNow, learnersStart, churnNow, churnStart, won, wonPrev, cash, cashStart, revenueTrend, learnerTrend] =
    await Promise.all([
      access.finance ? revenueTotal(p.from, p.end) : none,
      access.finance ? revenueTotal(p.prevFrom, p.prevEnd) : none,
      access.finance ? mrrAt(window.to) : none,
      access.finance ? mrrAt(window.from) : none,
      access.learners ? learnerPlatform.snapshotAt(window.to) : none,
      access.learners ? learnerPlatform.snapshotAt(window.from) : none,
      access.learners ? churnRate(window.to) : none,
      access.learners ? churnRate(window.from) : none,
      access.schools ? schoolsWon(p.from, p.end) : none,
      access.schools ? schoolsWon(p.prevFrom, p.prevEnd) : none,
      access.finance ? cashPosition(window.to) : none,
      access.finance ? cashBalanceAt(window.from) : none,
      access.finance ? revenueSeries(window) : none,
      access.learners ? learnerGrowthSeries(window) : none,
    ]);

  return {
    access,
    revenue: revenue && revenuePrev ? { ...compare(revenue.total, revenuePrev.total), streams: revenue } : null,
    mrr: mrrNow && mrrStart ? { ...compare(mrrNow.total, mrrStart.total), now: mrrNow } : null,
    activeLearners: learnersNow && learnersStart ? compare(learnersNow.activeLearners, learnersStart.activeLearners) : null,
    payingLearners: learnersNow && learnersStart ? compare(learnersNow.payingLearners, learnersStart.payingLearners) : null,
    learners: learnersNow,
    churn: churnNow !== null && churnStart !== null ? compare(churnNow, churnStart) : null,
    schoolsWon: won !== null && wonPrev !== null ? compare(won, wonPrev) : null,
    cash: cash && cashStart !== null ? { ...compare(cash.balance, cashStart), position: cash } : null,
    revenueTrend,
    learnerTrend,
  };
}

// ─────────────────────────── Learners ───────────────────────────

export async function learnerIntelligence(user: SessionUser, window: DateWindow) {
  assertCan(user, "intelligence.read");
  assertCan(user, "dashboard.executive");
  const p = periodOf(window);
  const [now, start, newNow, newPrev, churnedNow, churnedPrev, growth, provinces, plans] = await Promise.all([
    learnerPlatform.snapshotAt(window.to),
    learnerPlatform.snapshotAt(window.from),
    learnerPlatform.newLearners(p.from, p.end),
    learnerPlatform.newLearners(p.prevFrom, p.prevEnd),
    learnerPlatform.cancellations(p.from, p.end),
    learnerPlatform.cancellations(p.prevFrom, p.prevEnd),
    learnerGrowthSeries(window),
    learnerPlatform.learnersByProvince(),
    learnerPlatform.planMix(window.to),
  ]);
  return {
    total: compare(now.totalLearners, start.totalLearners),
    active: compare(now.activeLearners, start.activeLearners),
    paying: compare(now.payingLearners, start.payingLearners),
    schoolSponsored: compare(now.schoolSponsored, start.schoolSponsored),
    trialing: compare(now.trialing, start.trialing),
    newLearners: compare(newNow, newPrev),
    churned: compare(churnedNow, churnedPrev),
    growth,
    byProvince: provinces.map((r) => ({
      key: r.province ?? "UNKNOWN",
      label: r.province ? PROVINCE[r.province as Province].label : "Not specified",
      learners: r.count,
    })),
    // Plan MRR is a revenue figure, so only counts leave this function (MRR by plan is on the finance-gated tab).
    byPlan: plans.map((r) => ({ key: r.plan, label: r.plan, subscriptions: r.subscriptions })),
  };
}

// ─────────────────────────── Subscriptions & revenue ───────────────────────────

export async function subscriptionIntelligence(user: SessionUser, window: DateWindow) {
  assertCan(user, "intelligence.read");
  const learners = can(user, "dashboard.executive");
  const finance = can(user, "finance.read");
  if (!learners && !finance) throw new ForbiddenError();
  const p = periodOf(window);
  const bks = windowBuckets(window);

  const [growth, churnPoints, churnStart, payingNow, payingStart, cancelled, cancelledPrev, mrrPoints, mrrStart, payingLearnersStart, revenue, revenueNow, revenuePrev, plans] =
    await Promise.all([
      learnerGrowthSeries(window),
      learners ? Promise.all(bks.map((b) => churnRate(b.end))) : none,
      learners ? churnRate(window.from) : none,
      learners ? learnerPlatform.payingSubscriptionsAt(window.to) : none,
      learners ? learnerPlatform.payingSubscriptionsAt(window.from) : none,
      learners ? learnerPlatform.cancellations(p.from, p.end) : none,
      learners ? learnerPlatform.cancellations(p.prevFrom, p.prevEnd) : none,
      finance ? Promise.all(bks.map((b) => mrrAt(b.end))) : none,
      finance ? mrrAt(window.from) : none,
      finance ? learnerPlatform.snapshotAt(window.from).then((s) => s.payingLearners) : none,
      finance ? revenueSeries(window) : none,
      finance ? revenueTotal(p.from, p.end) : none,
      finance ? revenueTotal(p.prevFrom, p.prevEnd) : none,
      finance ? learnerPlatform.planMix(window.to) : none,
    ]);

  /** Subscription MRR per paying (direct) learner; school seats carry no MRR. */
  const arpu = (subscriptionMrr: number, paying: number) => (paying > 0 ? subscriptionMrr / paying : 0);

  const mrrTrend = mrrPoints
    ? bks.map((b, i) => {
        const point = mrrPoints[i];
        const paying = growth[i]?.payingLearners ?? 0;
        return { key: b.key, label: b.label, subscription: Math.round(point.subscription), school: Math.round(point.school), arpu: Math.round(arpu(point.subscription, paying) * 100) / 100 };
      })
    : null;
  const lastMrr = mrrPoints?.at(-1);
  const lastPaying = growth.at(-1)?.payingLearners ?? 0;

  return {
    access: { learners, finance },
    churn: churnPoints && churnStart !== null ? compare(churnPoints.at(-1) ?? 0, churnStart) : null,
    churnTrend: churnPoints ? bks.map((b, i) => ({ key: b.key, label: b.label, churn: Math.round(churnPoints[i] * 100) / 100 })) : null,
    cancellationTrend: learners ? growth.map((g) => ({ key: g.key, label: g.label, churned: g.churned })) : null,
    payingSubscriptions: payingNow !== null && payingStart !== null ? compare(payingNow, payingStart) : null,
    cancellations: cancelled !== null && cancelledPrev !== null ? compare(cancelled, cancelledPrev) : null,
    mrr: lastMrr && mrrStart ? { ...compare(lastMrr.total, mrrStart.total), now: lastMrr } : null,
    arpu: lastMrr && mrrStart && payingLearnersStart !== null ? compare(arpu(lastMrr.subscription, lastPaying), arpu(mrrStart.subscription, payingLearnersStart)) : null,
    mrrTrend,
    revenue: revenueNow && revenuePrev ? { ...compare(revenueNow.total, revenuePrev.total), streams: revenueNow } : null,
    revenueTrend: revenue,
    mrrByPlan: plans ? plans.filter((r) => r.mrr > 0).map((r) => ({ key: r.plan, label: r.plan, mrr: Math.round(r.mrr) })) : null,
  };
}

// ─────────────────────────── Schools ───────────────────────────

/** When a school was won: its first non-draft partnership's signature (or its SAST start date if never marked signed). */
const WON_AT = Prisma.sql`MIN(COALESCE(p."signedAt", (p."startDate"::timestamp AT TIME ZONE 'Africa/Johannesburg') AT TIME ZONE 'UTC'))`;

const firstWins = Prisma.sql`SELECT ${WON_AT} AS won_at FROM "Partnership" p WHERE p."status" <> 'DRAFT' GROUP BY p."schoolId"`;

/** Schools whose first partnership was won in [from, to). Renewals do not count again. */
async function schoolsWon(from: Date, to: Date): Promise<number> {
  const [row] = await db.$queryRaw<{ n: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS n FROM (${firstWins}) w WHERE w.won_at >= ${sqlTs(from)} AND w.won_at < ${sqlTs(to)}
  `);
  return row.n;
}

/** Schools marked Lost in [from, to). */
function schoolsLost(from: Date, to: Date) {
  return db.school.count({ where: { stage: "LOST", stageChangedAt: { gte: from, lt: to } } });
}

/** Funnel steps: the open stages, then won (partnership signed or active). */
const FUNNEL = [...OPEN_STAGES.map((stage) => ({ key: stage, label: SCHOOL_STAGE[stage].label, stages: [stage] })), { key: "WON", label: "Won", stages: WON_STAGES }];

export async function schoolIntelligence(user: SessionUser, window: DateWindow) {
  assertCan(user, "intelligence.read");
  assertCan(user, "schools.read");
  const finance = can(user, "finance.read");
  const p = periodOf(window);
  const bks = windowBuckets(window);
  const g = window.granularity;

  const [kpis, wonNow, wonPrev, lostNow, lostPrev, wonRows, lostRows, contracted, revenue, renewals] = await Promise.all([
    schoolKpis(currentPeriods(window.to)),
    schoolsWon(p.from, p.end),
    schoolsWon(p.prevFrom, p.prevEnd),
    schoolsLost(p.from, p.end),
    schoolsLost(p.prevFrom, p.prevEnd),
    db.$queryRaw<{ key: string; value: number }[]>(Prisma.sql`
      SELECT ${tsBucketKey("w.won_at", g)} AS key, COUNT(*)::int AS value FROM (${firstWins}) w
      WHERE w.won_at >= ${sqlTs(p.from)} AND w.won_at < ${sqlTs(p.end)}
      GROUP BY 1
    `),
    db.$queryRaw<{ key: string; value: number }[]>(Prisma.sql`
      SELECT ${tsBucketKey('"stageChangedAt"', g)} AS key, COUNT(*)::int AS value FROM "School"
      WHERE "stage" = 'LOST' AND "stageChangedAt" >= ${sqlTs(p.from)} AND "stageChangedAt" < ${sqlTs(p.end)}
      GROUP BY 1
    `),
    Promise.all(bks.map((b) => schoolMrrAt(b.end))),
    finance ? revenueSeries(window) : none,
    upcomingRenewals(90),
  ]);

  // Stage-to-stage conversion from the current pipeline: a school at a later stage has passed every earlier one.
  // Lost schools are left out because the stage they were lost from isn't recorded.
  const byStage = new Map(kpis.pipeline.map((s) => [s.stage, s]));
  const steps = FUNNEL.map((step) => ({
    key: step.key,
    label: step.label,
    current: step.stages.reduce((n, s) => n + (byStage.get(s)?.count ?? 0), 0),
    value: step.stages.reduce((n, s) => n + (byStage.get(s)?.value ?? 0), 0),
    weighted: step.stages.reduce((n, s) => n + (byStage.get(s)?.weighted ?? 0), 0),
  }));
  const funnel = steps.map((step, i) => {
    const reached = steps.slice(i).reduce((n, s) => n + s.current, 0);
    const prevReached = i === 0 ? null : steps.slice(i - 1).reduce((n, s) => n + s.current, 0);
    return { ...step, reached, conversion: prevReached ? Math.round((reached / prevReached) * 1000) / 10 : null };
  });

  const won = new Map(wonRows.map((r) => [r.key, r.value]));
  const lost = new Map(lostRows.map((r) => [r.key, r.value]));
  const closed = wonNow + lostNow;
  const lostStage = byStage.get("LOST");

  return {
    access: { finance },
    openPipelineValue: kpis.openPipelineValue,
    weightedPipelineValue: kpis.weightedPipelineValue,
    prospects: kpis.prospects,
    activePartnerships: compare(kpis.activePartnerships, kpis.previousActivePartnerships),
    won: compare(wonNow, wonPrev),
    lost: compare(lostNow, lostPrev),
    winRate: closed ? (wonNow / closed) * 100 : null,
    funnel,
    lostTotal: { count: lostStage?.count ?? 0, value: lostStage?.value ?? 0 },
    outcomes: bks.map((b) => ({ key: b.key, label: b.label, won: won.get(b.key) ?? 0, lost: lost.get(b.key) ?? 0 })),
    contracted: bks.map((b, i) => ({ key: b.key, label: b.label, mrr: Math.round(contracted[i]) })),
    contractedNow: contracted.at(-1) ?? 0,
    invoiced: revenue ? revenue.map((r) => ({ key: r.key, label: r.label, school: r.school })) : null,
    renewals: renewals.map((r) => ({
      id: r.id,
      schoolId: r.school.id,
      school: r.school.name,
      owner: r.school.owner?.name ?? null,
      status: r.status,
      endDate: r.endDate,
      annualValue: r.annualValue,
      learnersCovered: r.learnersCovered,
    })),
  };
}

// ─────────────────────────── Marketing ───────────────────────────

interface CampaignTotals {
  spend: number;
  leads: number;
  conversions: number;
}

function efficiency({ spend, leads, conversions }: CampaignTotals) {
  return {
    costPerLead: leads ? spend / leads : null,
    costPerConversion: conversions ? spend / conversions : null,
    conversionRate: leads ? (conversions / leads) * 100 : null,
  };
}

const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

export async function marketingIntelligence(user: SessionUser, window: DateWindow) {
  assertCan(user, "intelligence.read");
  assertCan(user, "marketing.read");
  const p = periodOf(window);
  // Campaign metrics are recorded per week (dated by the week's Monday) and attributed to that date,
  // so day-sized buckets are widened to weeks and a week that started before the window is left out.
  const weekly: DateWindow = window.granularity === "day" ? { ...window, granularity: "week" } : window;
  const bks = windowBuckets(weekly).filter((b) => b.start >= window.from);
  const inWindow = Prisma.sql`m."periodStart" >= ${sqlDate(dbDate(p.from))} AND m."periodStart" < ${sqlDate(dbDate(p.end))}`;

  const [now, prev, series, channels, campaigns] = await Promise.all([
    db.campaignMetric.aggregate({ where: { periodStart: { gte: dbDate(p.from), lt: dbDate(p.end) } }, _sum: { spend: true, leads: true, conversions: true, revenue: true } }),
    db.campaignMetric.aggregate({ where: { periodStart: { gte: dbDate(p.prevFrom), lt: dbDate(p.prevEnd) } }, _sum: { spend: true, leads: true, conversions: true, revenue: true } }),
    db.$queryRaw<({ key: string } & CampaignTotals)[]>(Prisma.sql`
      SELECT ${dateBucketKey('m."periodStart"', weekly.granularity)} AS key,
        COALESCE(SUM(m."spend"), 0)::float AS spend, COALESCE(SUM(m."leads"), 0)::int AS leads, COALESCE(SUM(m."conversions"), 0)::int AS conversions
      FROM "CampaignMetric" m WHERE ${inWindow}
      GROUP BY 1
    `),
    db.$queryRaw<({ channel: CampaignChannel } & CampaignTotals)[]>(Prisma.sql`
      SELECT c."channel", COALESCE(SUM(m."spend"), 0)::float AS spend, COALESCE(SUM(m."leads"), 0)::int AS leads, COALESCE(SUM(m."conversions"), 0)::int AS conversions
      FROM "CampaignMetric" m JOIN "Campaign" c ON c."id" = m."campaignId"
      WHERE ${inWindow}
      GROUP BY c."channel" ORDER BY spend DESC
    `),
    db.$queryRaw<({ id: string; name: string; channel: CampaignChannel; status: CampaignStatus; revenue: number } & CampaignTotals)[]>(Prisma.sql`
      SELECT c."id", c."name", c."channel", c."status",
        COALESCE(SUM(m."spend"), 0)::float AS spend, COALESCE(SUM(m."leads"), 0)::int AS leads,
        COALESCE(SUM(m."conversions"), 0)::int AS conversions, COALESCE(SUM(m."revenue"), 0)::float AS revenue
      FROM "CampaignMetric" m JOIN "Campaign" c ON c."id" = m."campaignId"
      WHERE ${inWindow}
      GROUP BY c."id" ORDER BY spend DESC
    `),
  ]);

  const totals = (agg: typeof now) => ({
    spend: Number(agg._sum.spend ?? 0),
    leads: agg._sum.leads ?? 0,
    conversions: agg._sum.conversions ?? 0,
    revenue: Number(agg._sum.revenue ?? 0),
  });
  const t = totals(now);
  const tp = totals(prev);
  const e = efficiency(t);
  const ep = efficiency(tp);
  /** Cost ratios are undefined without leads / conversions, in either period. */
  const ratio = (value: number | null, previous: number | null) =>
    value === null ? null : { value, previous, delta: previous === null ? null : percentChange(value, previous) };
  const byKey = new Map(series.map((r) => [r.key, r]));

  return {
    granularity: weekly.granularity,
    spend: compare(t.spend, tp.spend),
    leads: compare(t.leads, tp.leads),
    conversions: compare(t.conversions, tp.conversions),
    revenue: t.revenue,
    costPerLead: ratio(e.costPerLead, ep.costPerLead),
    costPerConversion: ratio(e.costPerConversion, ep.costPerConversion),
    conversionRate: e.conversionRate,
    previousConversionRate: ep.conversionRate,
    trend: bks.map((b) => {
      const row = byKey.get(b.key) ?? { spend: 0, leads: 0, conversions: 0 };
      const eff = efficiency(row);
      return { key: b.key, label: b.label, spend: Math.round(row.spend), leads: row.leads, conversions: row.conversions, costPerLead: round2(eff.costPerLead), costPerConversion: round2(eff.costPerConversion) };
    }),
    byChannel: channels.map((c) => {
      const eff = efficiency(c);
      return { key: c.channel, label: CAMPAIGN_CHANNEL[c.channel].label, spend: Math.round(c.spend), leads: c.leads, conversions: c.conversions, costPerLead: round2(eff.costPerLead), costPerConversion: round2(eff.costPerConversion) };
    }),
    byCampaign: campaigns.map((c) => ({ ...c, ...efficiency(c) })),
  };
}

// ─────────────────────────── Academic ───────────────────────────

export async function academicIntelligence(user: SessionUser, window: DateWindow) {
  assertCan(user, "intelligence.read");
  assertCan(user, "academic.read");
  const p = periodOf(window);
  const bks = windowBuckets(window);
  const published = (from: Date, to: Date) => db.contentItem.count({ where: { stage: "PUBLISHED", publishedAt: { gte: from, lt: to } } });
  const hoursWhere = (from: Date, to: Date) => ({ date: { gte: dbDate(from), lt: dbDate(to) }, status: { not: "REJECTED" as const } });

  const [publishedNow, publishedPrev, publishedRows, hoursByActivity, hoursPrev, engagement] = await Promise.all([
    published(p.from, p.end),
    published(p.prevFrom, p.prevEnd),
    db.$queryRaw<{ key: string; type: ContentType; n: number }[]>(Prisma.sql`
      SELECT ${tsBucketKey('"publishedAt"', window.granularity)} AS key, "type", COUNT(*)::int AS n
      FROM "ContentItem"
      WHERE "stage" = 'PUBLISHED' AND "publishedAt" >= ${sqlTs(p.from)} AND "publishedAt" < ${sqlTs(p.end)}
      GROUP BY 1, 2
    `),
    db.tutorTimeEntry.groupBy({ by: ["activity"], where: hoursWhere(p.from, p.end), _sum: { hours: true } }),
    db.tutorTimeEntry.aggregate({ where: hoursWhere(p.prevFrom, p.prevEnd), _sum: { hours: true } }),
    // Weekly snapshots, attributed to the week's Monday like campaign metrics.
    learnerPlatform.engagementSeries(dbDate(p.from), dbDate(p.end)),
  ]);

  const types = Object.keys(CONTENT_TYPE) as ContentType[];
  const counts = new Map(publishedRows.map((r) => [`${r.key}|${r.type}`, r.n]));
  const activities = Object.keys(TUTOR_ACTIVITY) as TutorActivity[];
  const hours = new Map(hoursByActivity.map((h) => [h.activity, Number(h._sum.hours ?? 0)]));
  const hoursNow = [...hours.values()].reduce((s, h) => s + h, 0);
  const last = engagement.at(-1);
  const prevWeek = engagement.at(-2);

  return {
    published: compare(publishedNow, publishedPrev),
    publishedTrend: bks.map((b) => ({ key: b.key, label: b.label, ...Object.fromEntries(types.map((t) => [t, counts.get(`${b.key}|${t}`) ?? 0])) })),
    contentTypes: types.map((t) => ({ key: t, label: CONTENT_TYPE[t].label })),
    hours: compare(hoursNow, Number(hoursPrev._sum.hours ?? 0)),
    hoursByActivity: activities
      .map((a) => ({ key: a, label: TUTOR_ACTIVITY[a].label, hours: Math.round((hours.get(a) ?? 0) * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours),
    weeklyActive: last ? { value: last.activeLearners, previous: prevWeek?.activeLearners ?? null, delta: prevWeek ? percentChange(last.activeLearners, prevWeek.activeLearners) : null } : null,
    quizScore: last ? { value: last.avgQuizScore, change: prevWeek ? Math.round((last.avgQuizScore - prevWeek.avgQuizScore) * 10) / 10 : null } : null,
    // Null (not zero) when no weekly snapshot falls in the period, e.g. a 7-day window before the week's sync.
    lessonsCompleted: engagement.length ? engagement.reduce((s, e) => s + e.lessonsCompleted, 0) : null,
    videoMinutes: engagement.length ? engagement.reduce((s, e) => s + e.videoMinutes, 0) : null,
    engagement: engagement.map((e) => ({ ...e, label: formatShortDate(new Date(`${e.key}T12:00:00Z`)) })),
  };
}

// ─────────────────────────── Financial KPIs ───────────────────────────

/**
 * Cost of revenue: the direct cost of delivering the platform to learners and
 * schools (hosting & streaming, content production, payment-processing fees).
 * Everything else approved or paid is an operating expense.
 */
export const COST_OF_REVENUE: ExpenseCategory[] = ["HOSTING", "CONTENT_PRODUCTION", "BANK_FEES"];

function splitCosts(rows: { category: ExpenseCategory; amount: number }[]) {
  const costOfRevenue = rows.filter((r) => COST_OF_REVENUE.includes(r.category)).reduce((s, r) => s + r.amount, 0);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return { costOfRevenue, operating: total - costOfRevenue, total };
}

const margin = (revenue: number, costOfRevenue: number) => (revenue > 0 ? ((revenue - costOfRevenue) / revenue) * 100 : null);

export async function financialIntelligence(user: SessionUser, window: DateWindow) {
  assertCan(user, "intelligence.read");
  assertCan(user, "finance.read");
  const p = periodOf(window);
  const bks = windowBuckets(window);
  // A single day's margin swings wildly with the timing of invoices and bills, so the
  // revenue / cost / margin trend uses at least weekly buckets. Cash movements stay daily.
  const costWindow: DateWindow = window.granularity === "day" ? { ...window, granularity: "week" } : window;

  const [revenueNow, revenuePrev, categories, categoriesPrev, revenue, costRows, flows, position, cashStart, balances] = await Promise.all([
    revenueTotal(p.from, p.end),
    revenueTotal(p.prevFrom, p.prevEnd),
    expensesByCategory(p.from, p.end),
    expensesByCategory(p.prevFrom, p.prevEnd),
    revenueSeries(costWindow),
    db.$queryRaw<{ key: string; cor: number; opex: number }[]>(Prisma.sql`
      SELECT ${dateBucketKey('"date"', costWindow.granularity)} AS key,
        COALESCE(SUM("amount") FILTER (WHERE "category"::text IN (${Prisma.join(COST_OF_REVENUE)})), 0)::float AS cor,
        COALESCE(SUM("amount") FILTER (WHERE "category"::text NOT IN (${Prisma.join(COST_OF_REVENUE)})), 0)::float AS opex
      FROM "Expense"
      WHERE "status" IN ('APPROVED', 'PAID') AND "date" >= ${sqlDate(dbDate(window.from))} AND "date" <= ${sqlDate(dbDate(window.to))}
      GROUP BY 1
    `),
    cashFlowSeries(window.from, window.to, window.granularity),
    cashPosition(window.to),
    cashBalanceAt(window.from),
    Promise.all(bks.map((b) => cashBalanceAt(b.end))),
  ]);

  const costs = splitCosts(categories);
  const costsPrev = splitCosts(categoriesPrev);
  const marginNow = margin(revenueNow.total, costs.costOfRevenue);
  const marginPrev = margin(revenuePrev.total, costsPrev.costOfRevenue);
  const byKey = new Map(costRows.map((r) => [r.key, r]));

  return {
    costGranularity: costWindow.granularity,
    revenue: compare(revenueNow.total, revenuePrev.total),
    grossMargin: marginNow === null ? null : { value: marginNow, previous: marginPrev, change: marginPrev === null ? null : marginNow - marginPrev },
    grossProfit: revenueNow.total - costs.costOfRevenue,
    costOfRevenue: compare(costs.costOfRevenue, costsPrev.costOfRevenue),
    operatingExpenses: compare(costs.operating, costsPrev.operating),
    netIncome: compare(revenueNow.total - costs.total, revenuePrev.total - costsPrev.total),
    cash: compare(position.balance, cashStart),
    position,
    costTrend: revenue.map((r) => {
      const c = byKey.get(r.key);
      const cor = Math.round(c?.cor ?? 0);
      const m = margin(r.total, cor);
      return { key: r.key, label: r.label, revenue: r.total, costOfRevenue: cor, operating: Math.round(c?.opex ?? 0), margin: m === null ? null : Math.round(m * 10) / 10 };
    }),
    cashFlow: flows,
    balance: bks.map((b, i) => ({ key: b.key, label: b.label, balance: Math.round(balances[i]) })),
    byCategory: categories.map((c) => ({ key: c.category, label: c.label, amount: Math.round(c.amount), costOfRevenue: COST_OF_REVENUE.includes(c.category) })),
  };
}
