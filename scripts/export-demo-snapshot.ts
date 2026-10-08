/**
 * Exports a self-contained JSON snapshot of the seeded demo data for the static,
 * browser-only web demo (no server needed). Figures come from the same services
 * the app uses, and each demo persona gets the record visibility its role allows.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/export-demo-snapshot.ts <out.json>
 */
import { writeFileSync } from "node:fs";
import type { Permission, RoleKey } from "@/lib/rbac";
import { PERMISSIONS, ROLES } from "@/lib/rbac";
import { RANGE_OPTIONS, addMonths, resolveRange, sastYear, startOfMonth, type RangeKey } from "@/lib/dates";
import type { SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { bugsVisibleWhere, meetingsVisibleWhere } from "@/server/services/access";
import { academicOverview } from "@/server/services/academic";
import { contentVisibleWhere } from "@/server/services/academic";
import { approvalsVisibleWhere } from "@/server/services/approvals";
import { getCalendarEvents } from "@/server/services/calendar";
import { getDashboard } from "@/server/services/dashboard";
import { documentsVisibleWhere } from "@/server/services/document-access";
import {
  cashFlowStatement,
  expensesByCategory,
  financeOverview,
  getBudget,
  listBudgets,
  listProjections,
  monthlyProfitAndLoss,
  projectionBaseline,
} from "@/server/services/finance";
import {
  academicIntelligence,
  financialIntelligence,
  intelligenceOverview,
  learnerIntelligence,
  marketingIntelligence,
  schoolIntelligence,
  subscriptionIntelligence,
} from "@/server/services/intelligence";
import { campaignsVisibleWhere, getCampaign, listCampaigns, marketingOverview } from "@/server/services/marketing";
import { getObjective, strategyOverview } from "@/server/services/strategy";
import { tasksVisibleWhere } from "@/server/services/tasks";
import { departmentHeadcount, listTeam } from "@/server/services/team";

const PERSONAS = ["sipho", "ayesha", "johan", "nomvula", "pieter", "kagiso", "tshepo", "bongani"];

async function sessionUser(email: string): Promise<SessionUser> {
  const u = await db.user.findUniqueOrThrow({
    where: { email },
    include: { department: true, role: { include: { permissions: { include: { permission: true } } } } },
  });
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    jobTitle: u.jobTitle,
    roleKey: u.role.key as RoleKey,
    roleName: u.role.name,
    departmentId: u.departmentId,
    departmentName: u.department?.name ?? null,
    permissions: new Set(u.role.permissions.map((rp) => rp.permission.key as Permission)),
    sessionId: "demo",
    mustChangePassword: false,
  };
}

/** Runs a service call, returning null when the role isn't allowed (ForbiddenError). */
async function maybe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if ((error as { code?: string }).code === "FORBIDDEN") return null;
    throw error;
  }
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: export-demo-snapshot.ts <out.json>");
  const now = new Date();
  const admin = await sessionUser("sipho@integral.demo");

  // ── Entities (full lists; the demo filters them per persona) ──
  const [users, departments, tasks, projects, approvals, notifications, announcements, documents, folders, meetings, schools, content, courses, tutors, timeEntries, features, bugs, income, expenses, audit] =
    await Promise.all([
      db.user.findMany({ orderBy: { name: "asc" }, include: { role: { select: { key: true, name: true } }, department: { select: { id: true, name: true } } } }),
      db.department.findMany({ orderBy: { name: "asc" } }),
      db.task.findMany({ orderBy: { number: "desc" }, include: { project: { select: { id: true, name: true } }, meeting: { select: { id: true, title: true } }, school: { select: { id: true, name: true } } } }),
      db.project.findMany({ orderBy: { name: "asc" } }),
      db.approval.findMany({ orderBy: { number: "desc" }, include: { decisions: { orderBy: { createdAt: "asc" } } } }),
      db.notification.findMany({ orderBy: { createdAt: "desc" }, take: 2000 }),
      db.announcement.findMany({ orderBy: { publishedAt: "desc" } }),
      db.document.findMany({ orderBy: { updatedAt: "desc" }, include: { tags: { include: { tag: true } }, versions: { orderBy: { version: "desc" }, select: { version: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, changeNote: true, uploadedById: true } }, accessGrants: { select: { userId: true } } } }),
      db.documentFolder.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
      db.meeting.findMany({ orderBy: { startsAt: "desc" }, include: { attendees: true, decisions: { orderBy: { createdAt: "asc" } } } }),
      db.school.findMany({ orderBy: { name: "asc" }, include: { contacts: true, notes: { orderBy: { createdAt: "desc" } }, partnerships: { orderBy: { startDate: "desc" } } } }),
      db.contentItem.findMany({ orderBy: { updatedAt: "desc" }, include: { course: { select: { id: true, title: true } }, topic: { select: { id: true, title: true } } } }),
      db.course.findMany({ orderBy: { title: "asc" }, include: { topics: { orderBy: { sortOrder: "asc" } } } }),
      db.tutorProfile.findMany({ include: { user: { select: { id: true, name: true } } } }),
      db.tutorTimeEntry.findMany({ orderBy: { date: "desc" }, take: 400 }),
      db.feature.findMany({ orderBy: { priority: "desc" } }),
      db.bug.findMany({ orderBy: { number: "desc" } }),
      db.income.findMany({ orderBy: { date: "desc" } }),
      db.expense.findMany({ orderBy: { date: "desc" } }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 400 }),
    ]);

  // ── Computed figures from the real services (as the Super Admin sees them) ──
  const year = sastYear(now);
  const budgetsList = await listBudgets(admin, year);
  const budgetDetails = await Promise.all(budgetsList.map((b) => getBudget(admin, b.id)));
  const campaignList = await listCampaigns(admin);
  const campaignDetails = await Promise.all(campaignList.map((c) => getCampaign(admin, c.id)));
  const strategy = await strategyOverview(admin, { year, period: "all" as never });
  const objectiveIds = (await db.objective.findMany({ select: { id: true } })).map((o) => o.id);
  const objectives = await Promise.all(objectiveIds.map((id) => getObjective(admin, id)));

  const biRanges: RangeKey[] = ["30d", "3m", "12m"];
  const bi: Record<string, unknown> = {};
  for (const r of biRanges) {
    const w = resolveRange(r, now);
    bi[r] = {
      overview: await intelligenceOverview(admin, w),
      learners: await learnerIntelligence(admin, w),
      subscriptions: await subscriptionIntelligence(admin, w),
      schools: await schoolIntelligence(admin, w),
      marketing: await marketingIntelligence(admin, w),
      academic: await academicIntelligence(admin, w),
      financial: await financialIntelligence(admin, w),
    };
  }

  const finance = {
    overview: await financeOverview(admin),
    pnl: await monthlyProfitAndLoss(12),
    expensesByCategory: await expensesByCategory(addMonths(startOfMonth(now), -11), now),
    cashFlowMonthly: await cashFlowStatement(admin, { view: "monthly", year }),
    cashFlowAnnual: await cashFlowStatement(admin, { view: "annual", year }),
    budgets: budgetDetails,
    projectionBaseline: await projectionBaseline(),
    projections: await listProjections(admin),
  };

  // ── Per persona: dashboards, calendar and record visibility from the real rules ──
  const personas: Record<string, unknown> = {};
  for (const key of PERSONAS) {
    const user = await sessionUser(`${key}@integral.demo`);
    const dashboards: Record<string, unknown> = {};
    for (const { value } of RANGE_OPTIONS) dashboards[value] = await getDashboard(user, value);
    const [vTasks, vApprovals, vDocs, vMeetings, vCampaigns, vContent, vBugs, team, headcount, calendar, marketing, academic] = await Promise.all([
      db.task.findMany({ where: tasksVisibleWhere(user), select: { id: true } }),
      db.approval.findMany({ where: approvalsVisibleWhere(user), select: { id: true } }),
      db.document.findMany({ where: documentsVisibleWhere(user), select: { id: true } }),
      db.meeting.findMany({ where: meetingsVisibleWhere(user), select: { id: true } }),
      db.campaign.findMany({ where: campaignsVisibleWhere(user), select: { id: true } }),
      db.contentItem.findMany({ where: contentVisibleWhere(user), select: { id: true } }),
      db.bug.findMany({ where: bugsVisibleWhere(user), select: { id: true } }),
      maybe(() => listTeam(user, {})),
      maybe(() => departmentHeadcount(user)),
      getCalendarEvents(user, addMonths(startOfMonth(now), -1), addMonths(startOfMonth(now), 3), { includeOverdue: true }),
      maybe(() => marketingOverview(user)),
      maybe(() => academicOverview(user)),
    ]);
    personas[key] = {
      userId: user.id,
      roleKey: user.roleKey,
      permissions: [...user.permissions],
      dashboards,
      visible: { tasks: ids(vTasks), approvals: ids(vApprovals), documents: ids(vDocs), meetings: ids(vMeetings), campaigns: ids(vCampaigns), content: ids(vContent), bugs: ids(vBugs) },
      team,
      headcount,
      calendar,
      marketing,
      academic,
    };
    console.log("persona", key, "tasks", vTasks.length, "docs", vDocs.length, "events", calendar.length);
  }

  const snapshot = {
    meta: { generatedAt: now.toISOString(), year, note: "Fictional seed data for demonstration only." },
    rbac: { permissions: PERMISSIONS, roles: ROLES },
    users: users.map(({ passwordHash: _p, failedLoginCount: _f, lockedUntil: _l, mustChangePassword: _m, ...u }) => u),
    departments,
    tasks,
    projects,
    approvals,
    notifications,
    announcements,
    documents,
    folders,
    meetings,
    schools,
    content,
    courses,
    tutors,
    timeEntries,
    features,
    bugs,
    income,
    expenses,
    campaigns: campaignDetails,
    strategy,
    objectives,
    finance,
    bi,
    audit,
    personas,
  };
  // Prisma Decimals serialise as strings; convert them to numbers for the browser.
  const json = JSON.stringify(snapshot, (_k, v) => (v && typeof v === "object" && v.constructor?.name === "Decimal" ? Number(v) : v));
  writeFileSync(out, json);
  console.log(`wrote ${out} (${(json.length / 1024 / 1024).toFixed(2)} MB)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
