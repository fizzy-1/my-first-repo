import { NextResponse, type NextRequest } from "next/server";
import { ExpenseCategory, ExpenseStatus, IncomeCategory, IncomeStatus, SchoolStage } from "@prisma/client";
import type { Permission } from "@/lib/rbac";
import { toCsv } from "@/lib/csv";
import { dayKey, parseRange, resolveRange } from "@/lib/dates";
import { oneOf } from "@/lib/list-params";
import { audit } from "@/server/audit";
import { canAny, getCurrentUser, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { listExpenses, listIncome, monthlyProfitAndLoss } from "@/server/services/finance";
import { learnerGrowthSeries, revenueSeries } from "@/server/services/metrics";

export const dynamic = "force-dynamic";

type Report = {
  /** Every one of these is required. */
  requires: Permission[];
  build: (user: SessionUser, params: URLSearchParams) => Promise<{ headers: string[]; rows: unknown[][] }>;
};

const MAX_ROWS = 10_000;

const REPORTS: Record<string, Report> = {
  "finance-summary": {
    requires: ["finance.read", "reports.export"],
    build: async () => {
      const rows = await monthlyProfitAndLoss(12);
      return { headers: ["Month", "Revenue (ZAR)", "Expenses (ZAR)", "Net (ZAR)"], rows: rows.map((r) => [r.key, r.revenue, r.expenses, r.net]) };
    },
  },
  revenue: {
    requires: ["finance.read", "reports.export"],
    build: async (_u, p) => {
      const rows = await revenueSeries(resolveRange(parseRange(p.get("range") ?? undefined)));
      return { headers: ["Period", "Subscriptions", "School contracts", "Other income", "Total"], rows: rows.map((r) => [r.key, r.subscription, r.school, r.other, r.total]) };
    },
  },
  learners: {
    requires: ["dashboard.executive", "reports.export"],
    build: async (_u, p) => {
      const rows = await learnerGrowthSeries(resolveRange(parseRange(p.get("range") ?? undefined)));
      return {
        headers: ["Period", "Total learners", "Active learners", "Paying learners", "New learners", "Churned (paid cancellations)"],
        rows: rows.map((r) => [r.key, r.totalLearners, r.activeLearners, r.payingLearners, r.newLearners, r.churned]),
      };
    },
  },
  income: {
    requires: ["finance.read", "reports.export"],
    build: async (user, p) => {
      const { rows } = await listIncome(user, {
        q: p.get("q") || undefined,
        status: oneOf<IncomeStatus>(p.get("status") ?? undefined, IncomeStatus),
        category: oneOf<IncomeCategory>(p.get("category") ?? undefined, IncomeCategory),
        sort: "date",
        dir: "desc",
        skip: 0,
        take: MAX_ROWS,
      });
      return {
        headers: ["Invoice", "Date", "Customer", "Description", "Category", "Amount (ZAR)", "Payment method", "Reference", "Status", "Due date", "Received"],
        rows: rows.map((i) => [`INV-${i.number}`, i.date, i.customer, i.description, i.category, i.amount, i.paymentMethod, i.reference, i.status, i.dueDate, i.receivedAt]),
      };
    },
  },
  expenses: {
    requires: ["finance.read", "reports.export"],
    build: async (user, p) => {
      const { rows } = await listExpenses(user, {
        q: p.get("q") || undefined,
        status: oneOf<ExpenseStatus>(p.get("status") ?? undefined, ExpenseStatus),
        category: oneOf<ExpenseCategory>(p.get("category") ?? undefined, ExpenseCategory),
        departmentId: p.get("department") || undefined,
        sort: "date",
        dir: "desc",
        skip: 0,
        take: MAX_ROWS,
      });
      return {
        headers: ["Ref", "Date", "Supplier", "Description", "Category", "Department", "Amount (ZAR)", "Status", "Due", "Paid", "Reference"],
        rows: rows.map((e) => [`EXP-${e.number}`, e.date, e.supplier, e.description, e.category, e.department?.name, e.amount, e.status, e.dueDate, e.paidAt, e.reference]),
      };
    },
  },
  schools: {
    requires: ["schools.read", "reports.export"],
    build: async (_u, p) => {
      const stage = oneOf<SchoolStage>(p.get("stage") ?? undefined, SchoolStage);
      const rows = await db.school.findMany({
        where: stage ? { stage } : {},
        orderBy: { name: "asc" },
        take: MAX_ROWS,
        include: { owner: { select: { name: true } }, contacts: { where: { isPrimary: true }, take: 1 } },
      });
      return {
        headers: ["School", "EMIS", "Type", "Province", "City", "Stage", "Learners", "Potential learners", "Expected annual value (ZAR)", "Probability %", "Owner", "Primary contact", "Contact email", "Next follow-up"],
        rows: rows.map((s) => [s.name, s.emisNumber, s.type, s.province, s.city, s.stage, s.learnerCount, s.potentialLearners, Number(s.expectedAnnualValue), s.probability, s.owner?.name, s.contacts[0]?.name, s.contacts[0]?.email, s.nextFollowUpAt]),
      };
    },
  },
  campaigns: {
    requires: ["marketing.read", "reports.export"],
    build: async () => {
      const rows = await db.campaign.findMany({
        orderBy: { startDate: "desc" },
        include: { owner: { select: { name: true } }, metrics: { select: { spend: true, leads: true, conversions: true, revenue: true } } },
      });
      return {
        headers: ["Campaign", "Channel", "Status", "Start", "End", "Budget", "Spend", "Leads", "Conversions", "Cost per lead", "Cost per acquisition", "Revenue", "Owner"],
        rows: rows.map((c) => {
          const spend = c.metrics.reduce((s, m) => s + Number(m.spend), 0);
          const leads = c.metrics.reduce((s, m) => s + m.leads, 0);
          const conv = c.metrics.reduce((s, m) => s + m.conversions, 0);
          const revenue = c.metrics.reduce((s, m) => s + Number(m.revenue), 0);
          return [c.name, c.channel, c.status, c.startDate, c.endDate, Number(c.budget), spend.toFixed(2), leads, conv, leads ? (spend / leads).toFixed(2) : "", conv ? (spend / conv).toFixed(2) : "", revenue.toFixed(2), c.owner?.name];
        }),
      };
    },
  },
  audit: {
    requires: ["audit.read"],
    build: async (_u, p) => {
      const moduleFilter = p.get("module") || undefined;
      const rows = await db.auditLog.findMany({
        where: moduleFilter ? { module: moduleFilter } : {},
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
        include: { actor: { select: { name: true, email: true } } },
      });
      return {
        headers: ["Timestamp (UTC)", "User", "Email", "Module", "Action", "Entity", "Entity ID", "Summary", "Previous value", "New value", "IP address"],
        rows: rows.map((a) => [a.createdAt.toISOString(), a.actor?.name ?? "System", a.actor?.email, a.module, a.action, a.entityType, a.entityId, a.summary, a.before ? JSON.stringify(a.before) : "", a.after ? JSON.stringify(a.after) : "", a.ipAddress]),
      };
    },
  },
};

export async function GET(request: NextRequest, ctx: RouteContext<"/api/reports/[report]">) {
  const { report: key } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const report = REPORTS[key];
  if (!report) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  if (!report.requires.every((p) => canAny(user, [p]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { headers, rows } = await report.build(user, request.nextUrl.searchParams);
  await audit(user, {
    action: "report.exported",
    module: "intelligence",
    entityType: "Report",
    entityId: key,
    summary: `${user.name} exported the ${key} report (${rows.length} rows)`,
    after: { params: Object.fromEntries(request.nextUrl.searchParams) },
  });
  const filename = `integral-${key}-${dayKey(new Date())}.csv`;
  return new NextResponse(`﻿${toCsv(headers, rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
