import "server-only";
import type { Prisma } from "@prisma/client";
import { addDays, addMonths, dbDate, resolveRange, startOfMonth, startOfQuarter, startOfWeek, type RangeKey } from "@/lib/dates";
import { formatZAR } from "@/lib/format";
import { percentChange } from "@/lib/utils";
import { can, canAny, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { learnerPlatform } from "@/server/integrations/learner-platform";
import { recentActivity } from "./activity";
import { pendingApprovalsForDashboard } from "./approvals";
import { meetingsVisibleWhere } from "./access";
import { getCalendarEvents } from "./calendar";
import {
  cashPosition,
  churnRate,
  currentPeriods,
  learnerGrowthSeries,
  learnerKpis,
  mrrAt,
  receivablesAndPayables,
  revenueSeries,
  revenueTotal,
  schoolKpis,
} from "./metrics";
import { companyObjectivesSummary } from "./strategy";
import { myOpenTasks, overdueTasks, tasksVisibleWhere } from "./tasks";

// ─────────────────────────── Widget registry ───────────────────────────

/**
 * Dashboard widgets. Order and visibility are per-user (DashboardPreference);
 * each widget also declares the permissions required to render it.
 */
export const DASHBOARD_WIDGETS = [
  { id: "kpis", label: "Key metrics" },
  { id: "revenue", label: "Revenue" },
  { id: "learners", label: "Learner growth" },
  { id: "pipeline", label: "Business pipeline" },
  { id: "actions", label: "Executive action centre" },
  { id: "mywork", label: "My tasks & meetings" },
  { id: "objectives", label: "Strategic objectives" },
  { id: "marketing", label: "Marketing performance" },
  { id: "academic", label: "Academic progress" },
  { id: "technology", label: "Product & technology" },
  { id: "activity", label: "Recent activity" },
] as const;

export type WidgetId = (typeof DASHBOARD_WIDGETS)[number]["id"];

export async function getDashboardPreferences(user: SessionUser) {
  const pref = await db.dashboardPreference.findUnique({ where: { userId: user.id } });
  const known = DASHBOARD_WIDGETS.map((w) => w.id) as string[];
  const order = [...(pref?.widgetOrder ?? []).filter((id) => known.includes(id)), ...known.filter((id) => !pref?.widgetOrder.includes(id))];
  return { order: order as WidgetId[], hidden: (pref?.hiddenWidgets ?? []).filter((id) => known.includes(id)) as WidgetId[], defaultRange: pref?.defaultRange };
}

export async function saveDashboardPreferences(user: SessionUser, input: { order: string[]; hidden: string[]; defaultRange?: string }) {
  const known = DASHBOARD_WIDGETS.map((w) => w.id) as string[];
  const order = input.order.filter((id) => known.includes(id));
  const hidden = input.hidden.filter((id) => known.includes(id));
  await db.dashboardPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, widgetOrder: order, hiddenWidgets: hidden, defaultRange: input.defaultRange ?? null },
    update: { widgetOrder: order, hiddenWidgets: hidden, ...(input.defaultRange ? { defaultRange: input.defaultRange } : {}) },
  });
}

// ─────────────────────────── Snapshots ───────────────────────────

async function marketingSnapshot(user: SessionUser) {
  const scope: Prisma.CampaignWhereInput = can(user, "marketing.read")
    ? {}
    : { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] };
  const since = dbDate(addDays(new Date(), -30));
  const prevSince = dbDate(addDays(new Date(), -60));
  const [active, metrics, prev, top] = await Promise.all([
    db.campaign.count({ where: { AND: [scope, { status: "ACTIVE" }] } }),
    db.campaignMetric.aggregate({
      where: { periodStart: { gte: since }, campaign: scope },
      _sum: { spend: true, leads: true, conversions: true, revenue: true },
    }),
    db.campaignMetric.aggregate({
      where: { periodStart: { gte: prevSince, lt: since }, campaign: scope },
      _sum: { leads: true },
    }),
    db.campaign.findMany({
      where: { AND: [scope, { status: "ACTIVE" }] },
      select: { id: true, name: true, budget: true, metrics: { where: { periodStart: { gte: since } }, select: { spend: true, leads: true, conversions: true } } },
      take: 4,
      orderBy: { startDate: "desc" },
    }),
  ]);
  const spend = Number(metrics._sum.spend ?? 0);
  const leads = metrics._sum.leads ?? 0;
  const conversions = metrics._sum.conversions ?? 0;
  return {
    activeCampaigns: active,
    spend,
    leads,
    conversions,
    revenue: Number(metrics._sum.revenue ?? 0),
    costPerLead: leads ? spend / leads : null,
    costPerAcquisition: conversions ? spend / conversions : null,
    leadsGrowth: percentChange(leads, prev._sum.leads ?? 0),
    campaigns: top.map((c) => {
      const s = c.metrics.reduce((t, m) => t + Number(m.spend), 0);
      const l = c.metrics.reduce((t, m) => t + m.leads, 0);
      return { id: c.id, name: c.name, budget: Number(c.budget), spend: s, leads: l, cpl: l ? s / l : null };
    }),
  };
}

async function academicSnapshot(user: SessionUser) {
  const scope: Prisma.ContentItemWhereInput = can(user, "academic.read") ? {} : { OR: [{ assigneeId: user.id }, { reviewerId: user.id }] };
  const now = new Date();
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now);
  const [byStage, publishedThisMonth, overdue, engagement] = await Promise.all([
    db.contentItem.groupBy({ by: ["stage"], where: scope, _count: true }),
    db.contentItem.count({ where: { AND: [scope, { stage: "PUBLISHED", publishedAt: { gte: monthStart } }] } }),
    db.contentItem.count({ where: { AND: [scope, { stage: { not: "PUBLISHED" }, dueDate: { lt: dbDate(now) } }] } }),
    can(user, "academic.read") ? learnerPlatform.engagementSeries(addDays(weekStart, -7 * 8), addDays(weekStart, 7)) : Promise.resolve([]),
  ]);
  const stageCount = Object.fromEntries(byStage.map((s) => [s.stage, s._count])) as Record<string, number>;
  const last = engagement.at(-1);
  const prev = engagement.at(-2);
  return {
    stageCount,
    inProduction: (stageCount.RECORDING ?? 0) + (stageCount.EDITING ?? 0),
    inReview: stageCount.REVIEW ?? 0,
    publishedThisMonth,
    overdue,
    engagement: engagement.map((e) => ({ key: e.key, activeLearners: e.activeLearners, lessonsCompleted: e.lessonsCompleted })),
    weeklyActive: last?.activeLearners ?? null,
    weeklyActiveGrowth: last && prev ? percentChange(last.activeLearners, prev.activeLearners) : null,
    avgQuizScore: last?.avgQuizScore ?? null,
  };
}

async function technologySnapshot(user: SessionUser) {
  const bugScope: Prisma.BugWhereInput = can(user, "technology.read") ? {} : { OR: [{ assigneeId: user.id }, { reporterId: user.id }] };
  const quarterStart = startOfQuarter(new Date());
  const [bugs, features, released] = await Promise.all([
    db.bug.groupBy({ by: ["severity"], where: { AND: [bugScope, { status: { in: ["OPEN", "IN_PROGRESS"] } }] }, _count: true }),
    db.feature.groupBy({ by: ["status"], _count: true }),
    db.feature.count({ where: { status: "RELEASED", releasedAt: { gte: quarterStart } } }),
  ]);
  const sev = Object.fromEntries(bugs.map((b) => [b.severity, b._count])) as Record<string, number>;
  const feat = Object.fromEntries(features.map((f) => [f.status, f._count])) as Record<string, number>;
  return {
    openBugs: bugs.reduce((s, b) => s + b._count, 0),
    critical: sev.CRITICAL ?? 0,
    high: sev.HIGH ?? 0,
    medium: sev.MEDIUM ?? 0,
    low: sev.LOW ?? 0,
    inProgress: feat.IN_PROGRESS ?? 0,
    testing: feat.TESTING ?? 0,
    planned: feat.PLANNED ?? 0,
    releasedThisQuarter: released,
  };
}

export interface CriticalIssue {
  id: string;
  title: string;
  detail: string;
  href: string;
  severity: "critical" | "high" | "warning";
  area: string;
}

async function criticalIssues(user: SessionUser, cash: Awaited<ReturnType<typeof cashPosition>> | null): Promise<CriticalIssue[]> {
  const issues: CriticalIssue[] = [];
  const jobs: Promise<void>[] = [];

  if (canAny(user, ["technology.read", "technology.read.assigned"])) {
    const scope: Prisma.BugWhereInput = can(user, "technology.read") ? {} : { assigneeId: user.id };
    jobs.push(
      db.bug
        .findMany({
          where: { AND: [scope, { status: { in: ["OPEN", "IN_PROGRESS"] }, severity: { in: ["CRITICAL", "HIGH"] } }] },
          orderBy: [{ severity: "asc" }, { reportedAt: "asc" }],
          take: 4,
          select: { id: true, number: true, title: true, severity: true, assignee: { select: { name: true } } },
        })
        .then((bugs) => {
          for (const b of bugs)
            issues.push({
              id: `bug-${b.id}`,
              title: `${b.severity === "CRITICAL" ? "Critical" : "High"} bug #${b.number}: ${b.title}`,
              detail: b.assignee ? `Assigned to ${b.assignee.name}` : "Unassigned",
              href: `/technology/bugs?q=${b.number}`,
              severity: b.severity === "CRITICAL" ? "critical" : "high",
              area: "Technology",
            });
        }),
    );
  }

  if (can(user, "finance.read")) {
    jobs.push(
      receivablesAndPayables().then((r) => {
        if (r.overdueCount > 0)
          issues.push({
            id: "overdue-receivables",
            title: `${r.overdueCount} overdue invoice${r.overdueCount === 1 ? "" : "s"} (${formatZAR(r.overdueReceivables)})`,
            detail: "Customers past their payment due date",
            href: "/finance/income?status=OVERDUE",
            severity: r.overdueReceivables > 50_000 ? "high" : "warning",
            area: "Finance",
          });
      }),
    );
    if (cash?.runwayMonths !== null && cash?.runwayMonths !== undefined && cash.runwayMonths < 9) {
      issues.push({
        id: "runway",
        title: `Cash runway is ${cash.runwayMonths.toFixed(1)} months`,
        detail: `Net burn ${formatZAR(cash.netBurn)}/month against ${formatZAR(cash.balance)} cash`,
        href: "/finance",
        severity: cash.runwayMonths < 6 ? "critical" : "warning",
        area: "Finance",
      });
    }
  }

  if (can(user, "strategy.read")) {
    jobs.push(
      db.objective
        .findMany({ where: { status: { in: ["AT_RISK", "DELAYED"] } }, take: 3, select: { id: true, title: true, status: true, owner: { select: { name: true } } } })
        .then((rows) => {
          for (const o of rows)
            issues.push({
              id: `objective-${o.id}`,
              title: `Objective ${o.status === "DELAYED" ? "delayed" : "at risk"}: ${o.title}`,
              detail: `Owner: ${o.owner.name}`,
              href: "/strategy",
              severity: o.status === "DELAYED" ? "high" : "warning",
              area: "Strategy",
            });
        }),
    );
  }

  if (can(user, "academic.read")) {
    jobs.push(
      db.contentItem.count({ where: { stage: { not: "PUBLISHED" }, dueDate: { lt: dbDate(new Date()) } } }).then((n) => {
        if (n > 0)
          issues.push({
            id: "content-overdue",
            title: `${n} content item${n === 1 ? " is" : "s are"} past deadline`,
            detail: "Academic content pipeline",
            href: "/academic",
            severity: n > 5 ? "high" : "warning",
            area: "Academic",
          });
      }),
    );
  }

  jobs.push(
    db.task.count({ where: { AND: [tasksVisibleWhere(user), { status: "BLOCKED" }] } }).then((n) => {
      if (n > 0)
        issues.push({
          id: "blocked-tasks",
          title: `${n} blocked task${n === 1 ? "" : "s"}`,
          detail: "Work that cannot progress without intervention",
          href: "/tasks?scope=all&status=BLOCKED",
          severity: "warning",
          area: "Operations",
        });
    }),
  );

  await Promise.all(jobs);
  const rank = { critical: 0, high: 1, warning: 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ─────────────────────────── Assembly ───────────────────────────

export async function getDashboard(user: SessionUser, range: RangeKey) {
  const p = currentPeriods();
  const window = resolveRange(range, p.now);
  const show = {
    finance: can(user, "finance.read"),
    executive: can(user, "dashboard.executive"),
    schools: can(user, "schools.read"),
    marketing: canAny(user, ["marketing.read", "marketing.read.assigned"]),
    academic: canAny(user, ["academic.read", "academic.read.assigned"]),
    technology: canAny(user, ["technology.read", "technology.read.assigned"]),
    strategy: can(user, "strategy.read"),
  };
  const skip = Promise.resolve(null);

  const [
    revenueNow,
    revenuePrevSame,
    revenuePrevFull,
    mrrNow,
    mrrPrev,
    cash,
    learners,
    churnNow,
    churnPrev,
    schools,
    revenue,
    learnerSeries,
    approvals,
    overdue,
    deadlines,
    activity,
    objectives,
    marketing,
    academic,
    technology,
    announcements,
    myTasks,
    myMeetings,
    preferences,
  ] = await Promise.all([
    show.finance ? revenueTotal(p.monthStart, p.todayEnd) : skip,
    show.finance ? revenueTotal(p.prevMonthStart, p.prevSamePeriodEnd) : skip,
    show.finance ? revenueTotal(p.prevMonthStart, p.monthStart) : skip,
    show.finance ? mrrAt(p.now) : skip,
    show.finance ? mrrAt(addMonths(p.now, -1)) : skip,
    show.finance ? cashPosition(p.now) : skip,
    show.executive ? learnerKpis(p) : skip,
    show.executive ? churnRate(p.now) : skip,
    show.executive ? churnRate(addDays(p.now, -30)) : skip,
    show.schools ? schoolKpis(p) : skip,
    show.finance ? revenueSeries(window) : skip,
    show.executive ? learnerGrowthSeries(window) : skip,
    pendingApprovalsForDashboard(user),
    overdueTasks(user),
    getCalendarEvents(user, p.now, addDays(p.now, 14), {
      kinds: ["meeting", "approval", "contract", "receivable", "payable", "campaign", "content", "followup", "objective", "release"],
    }),
    recentActivity(user, 12),
    show.strategy ? companyObjectivesSummary(user) : skip,
    show.marketing ? marketingSnapshot(user) : skip,
    show.academic ? academicSnapshot(user) : skip,
    show.technology ? technologySnapshot(user) : skip,
    db.announcement.findMany({
      where: { publishedAt: { lte: p.now }, OR: [{ expiresAt: null }, { expiresAt: { gt: p.now } }] },
      orderBy: { publishedAt: "desc" },
      take: 3,
      include: { author: { select: { name: true } } },
    }),
    myOpenTasks(user, 6),
    db.meeting.findMany({
      where: { AND: [meetingsVisibleWhere(user), { startsAt: { gte: p.now }, status: "SCHEDULED" }, { OR: [{ organizerId: user.id }, { attendees: { some: { userId: user.id } } }] }] },
      orderBy: { startsAt: "asc" },
      take: 4,
      select: { id: true, title: true, type: true, startsAt: true, endsAt: true, location: true },
    }),
    getDashboardPreferences(user),
  ]);

  const issues = await criticalIssues(user, cash);

  return {
    show,
    periods: p,
    range,
    revenue: revenueNow && revenuePrevSame && revenuePrevFull ? { now: revenueNow, prevSame: revenuePrevSame, prevFull: revenuePrevFull, growth: percentChange(revenueNow.total, revenuePrevSame.total) } : null,
    mrr: mrrNow && mrrPrev ? { now: mrrNow, prev: mrrPrev, growth: percentChange(mrrNow.total, mrrPrev.total) } : null,
    cash,
    learners,
    churn: churnNow !== null && churnPrev !== null ? { now: churnNow, prev: churnPrev } : null,
    schools,
    revenueSeries: revenue,
    learnerSeries,
    approvals,
    overdue,
    deadlines: deadlines.slice(0, 10),
    issues,
    activity,
    objectives,
    marketing,
    academic,
    technology,
    announcements,
    myTasks,
    myMeetings,
    preferences,
  };
}
