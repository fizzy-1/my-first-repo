import "server-only";
import type { ApprovalDecisionType } from "@prisma/client";
import { formatDate, formatDateTime, formatZAR } from "@/lib/format";
import { APPROVAL_TYPE } from "@/lib/labels";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { notify, type NotifyInput } from "@/server/notify";
import { usersWithPermission } from "@/server/rbac";
import { FINANCE_APPROVAL_TYPES } from "@/server/services/approvals";
import {
  calendarDaysBetween,
  daysSince,
  deadlineWindows,
  dedupeKeys,
  inDays,
  type DeadlineWindows,
} from "./deadline-rules";

/**
 * Deadline sweep, triggered by an external scheduler (POST /api/cron/deadlines)
 * or from a server shell (npm run jobs:deadlines). Safe to run as often as
 * hourly: every reminder carries a dedupe key and invoices only move from
 * INVOICED to OVERDUE once, so repeated or overlapping runs change nothing.
 */

export interface SweepCount {
  /** Records currently matching the rule. */
  matched: number;
  /** Notifications this run created (0 when everyone had already been told). */
  notified: number;
}

export interface DeadlineSweepSummary {
  ranAt: string;
  durationMs: number;
  tasksOverdue: SweepCount;
  tasksDueSoon: SweepCount;
  schoolFollowUps: SweepCount;
  approvalsWaiting: SweepCount;
  partnershipRenewals: SweepCount;
  invoicesMarkedOverdue: number;
  notificationsCreated: number;
}

type Reminder = NotifyInput & { dedupeKey: string };

const KEY_LOOKUP_CHUNK = 5_000;

/**
 * Sends the reminders nobody has received yet. Already-notified (user, key)
 * pairs are found with one query per chunk of keys, so a steady-state run over a
 * long backlog of overdue items writes nothing; notify() still skips
 * duplicates if two runs race.
 */
async function deliver(reminders: Reminder[]): Promise<number> {
  if (reminders.length === 0) return 0;
  const keys = [...new Set(reminders.map((r) => r.dedupeKey))];
  const sent = new Set<string>();
  for (let i = 0; i < keys.length; i += KEY_LOOKUP_CHUNK) {
    const rows = await db.notification.findMany({
      where: { dedupeKey: { in: keys.slice(i, i + KEY_LOOKUP_CHUNK) } },
      select: { userId: true, dedupeKey: true },
    });
    for (const row of rows) sent.add(`${row.userId}|${row.dedupeKey}`);
  }
  let created = 0;
  for (const reminder of reminders) {
    const userIds = reminder.userIds.filter((id): id is string => !!id && !sent.has(`${id}|${reminder.dedupeKey}`));
    if (userIds.length > 0) created += await notify({ ...reminder, userIds });
  }
  return created;
}

const isActive = (user: { id: string; status: string } | null): user is { id: string; status: "ACTIVE" } =>
  user?.status === "ACTIVE";

// ─────────────────────────── Tasks ───────────────────────────

async function sweepTasks(w: DeadlineWindows) {
  const tasks = await db.task.findMany({
    where: { status: { not: "COMPLETED" }, dueDate: { lt: w.dueSoonUntil }, assignee: { is: { status: "ACTIVE" } } },
    select: { id: true, number: true, title: true, dueDate: true, assigneeId: true },
  });
  const overdue: Reminder[] = [];
  const dueSoon: Reminder[] = [];
  for (const t of tasks) {
    if (!t.dueDate || !t.assigneeId) continue;
    if (t.dueDate < w.now) {
      overdue.push({
        userIds: [t.assigneeId],
        type: "TASK_OVERDUE",
        title: `Overdue: ${t.title}`,
        body: `Task #${t.number} was due ${formatDateTime(t.dueDate)}.`,
        link: `/tasks/${t.id}`,
        dedupeKey: dedupeKeys.taskOverdue(t.id),
      });
    } else {
      dueSoon.push({
        userIds: [t.assigneeId],
        type: "DEADLINE_UPCOMING",
        title: `Due soon: ${t.title}`,
        body: `Task #${t.number} is due ${formatDateTime(t.dueDate)}.`,
        link: `/tasks/${t.id}`,
        dedupeKey: dedupeKeys.taskDueSoon(t.id),
      });
    }
  }
  const tasksOverdue: SweepCount = { matched: overdue.length, notified: await deliver(overdue) };
  const tasksDueSoon: SweepCount = { matched: dueSoon.length, notified: await deliver(dueSoon) };
  return { tasksOverdue, tasksDueSoon };
}

// ─────────────────────────── Schools ───────────────────────────

/** Follow-ups due today or overdue go to the school's owner, or the schools team when it has none. */
async function sweepFollowUps(w: DeadlineWindows, schoolsTeam: () => Promise<string[]>): Promise<SweepCount> {
  const schools = await db.school.findMany({
    where: { nextFollowUpAt: { lt: w.startOfTomorrow }, stage: { not: "LOST" } },
    select: { id: true, name: true, nextFollowUpAt: true, owner: { select: { id: true, status: true } } },
  });
  const reminders: Reminder[] = [];
  for (const s of schools) {
    if (!s.nextFollowUpAt) continue;
    const userIds = isActive(s.owner) ? [s.owner.id] : await schoolsTeam();
    const overdue = s.nextFollowUpAt < w.startOfToday;
    reminders.push(
      overdue
        ? {
            userIds,
            type: "TASK_OVERDUE",
            title: `Follow-up overdue: ${s.name}`,
            body: `The follow-up with ${s.name} was due on ${formatDate(s.nextFollowUpAt)}.`,
            link: `/schools/${s.id}`,
            dedupeKey: dedupeKeys.followUpOverdue(s.id, s.nextFollowUpAt),
          }
        : {
            userIds,
            type: "DEADLINE_UPCOMING",
            title: `Follow-up due today: ${s.name}`,
            body: `A follow-up with ${s.name} is scheduled for today.`,
            link: `/schools/${s.id}`,
            dedupeKey: dedupeKeys.followUpDue(s.id, s.nextFollowUpAt),
          },
    );
  }
  return { matched: reminders.length, notified: await deliver(reminders) };
}

/**
 * Active or signed partnerships ending within the notice window. A follow-on
 * agreement already on file for the school (starting after this one) means the
 * renewal is in hand, so no reminder is sent.
 */
async function sweepRenewals(w: DeadlineWindows, schoolsTeam: () => Promise<string[]>): Promise<SweepCount> {
  const partnerships = await db.partnership.findMany({
    where: { status: { in: ["ACTIVE", "SIGNED"] }, endDate: { gte: w.today, lte: w.renewalUntil } },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      annualValue: true,
      school: {
        select: {
          id: true,
          name: true,
          owner: { select: { id: true, status: true } },
          partnerships: { where: { status: { in: ["DRAFT", "SIGNED", "ACTIVE"] } }, select: { id: true, startDate: true } },
        },
      },
    },
  });
  const reminders: Reminder[] = [];
  for (const p of partnerships) {
    if (!p.endDate) continue;
    const renewalOnFile = p.school.partnerships.some((other) => other.id !== p.id && other.startDate > p.startDate);
    if (renewalOnFile) continue;
    const days = calendarDaysBetween(p.endDate, w.today);
    reminders.push({
      userIds: isActive(p.school.owner) ? [p.school.owner.id] : await schoolsTeam(),
      type: "DEADLINE_UPCOMING",
      title: `Partnership renewal: ${p.school.name}`,
      body: `The ${formatZAR(Number(p.annualValue))}/yr partnership ends ${inDays(days)} (${formatDate(p.endDate)}). Time to agree the renewal.`,
      link: `/schools/${p.school.id}`,
      dedupeKey: dedupeKeys.partnershipRenewal(p.id, p.endDate),
    });
  }
  return { matched: reminders.length, notified: await deliver(reminders) };
}

// ─────────────────────────── Approvals ───────────────────────────

const SUBMISSIONS: ApprovalDecisionType[] = ["SUBMITTED", "RESUBMITTED"];

/**
 * Pending approvals not (re)submitted within the wait window. The reminder goes
 * to everyone canDecideApproval() allows: the named approver, every
 * approvals.decide holder and, for expense / purchase requests, the finance
 * deciders — never the requester.
 */
async function sweepApprovals(w: DeadlineWindows): Promise<SweepCount> {
  const approvals = await db.approval.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: w.approvalCutoff },
      decisions: { none: { decision: { in: SUBMISSIONS }, createdAt: { gte: w.approvalCutoff } } },
    },
    select: {
      id: true,
      number: true,
      title: true,
      type: true,
      requesterId: true,
      createdAt: true,
      requester: { select: { name: true } },
      approver: { select: { id: true, status: true } },
      decisions: { where: { decision: { in: SUBMISSIONS } }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  if (approvals.length === 0) return { matched: 0, notified: 0 };

  const [anyType, financeTypes] = await Promise.all([
    usersWithPermission(["approvals.decide"]),
    usersWithPermission(["approvals.decide.finance"]),
  ]);
  const reminders: Reminder[] = approvals.map((a) => {
    const waitingSince = a.decisions[0]?.createdAt ?? a.createdAt;
    const deciders = [
      ...(isActive(a.approver) ? [a.approver.id] : []),
      ...anyType.map((u) => u.id),
      ...(FINANCE_APPROVAL_TYPES.includes(a.type) ? financeTypes.map((u) => u.id) : []),
    ];
    return {
      userIds: deciders,
      excludeUserId: a.requesterId,
      type: "APPROVAL_REQUESTED",
      title: `Waiting ${daysSince(waitingSince, w.now)} days for a decision: ${a.title}`,
      body: `${a.requester.name}'s ${APPROVAL_TYPE[a.type].label.toLowerCase()} request #${a.number} has been awaiting a decision since ${formatDate(waitingSince)}.`,
      link: `/approvals/${a.id}`,
      dedupeKey: dedupeKeys.approvalWaiting(a.id, waitingSince),
    };
  });
  return { matched: reminders.length, notified: await deliver(reminders) };
}

// ─────────────────────────── Finance ───────────────────────────

/**
 * Moves unpaid invoices past their due date from INVOICED to OVERDUE. The
 * conditional update is atomic, so concurrent runs cannot flip (or audit) the
 * same invoice twice.
 */
async function markOverdueInvoices(w: DeadlineWindows): Promise<number> {
  return db.$transaction(
    async (tx) => {
      const flipped = await tx.income.updateManyAndReturn({
        where: { status: "INVOICED", dueDate: { lt: w.today } },
        data: { status: "OVERDUE" },
        select: { id: true, number: true, customer: true, amount: true, dueDate: true },
      });
      for (const invoice of flipped) {
        await audit(
          null,
          {
            action: "income.overdue",
            module: "finance",
            entityType: "Income",
            entityId: invoice.id,
            summary: `Invoice INV-${invoice.number} to ${invoice.customer} (${formatZAR(Number(invoice.amount))}) is overdue — it was due on ${formatDate(invoice.dueDate)}`,
            before: { status: "INVOICED" },
            after: { status: "OVERDUE" },
            feed: true,
          },
          tx,
        );
      }
      return flipped.length;
    },
    { timeout: 30_000 },
  );
}

// ─────────────────────────── Entry point ───────────────────────────

export async function runDeadlineSweep(now: Date = new Date()): Promise<DeadlineSweepSummary> {
  const started = performance.now();
  const w = deadlineWindows(now);
  let team: Promise<string[]> | undefined;
  const schoolsTeam = () => (team ??= usersWithPermission(["schools.write"]).then((users) => users.map((u) => u.id)));

  const [tasks, schoolFollowUps, partnershipRenewals, approvalsWaiting, invoicesMarkedOverdue] = await Promise.all([
    sweepTasks(w),
    sweepFollowUps(w, schoolsTeam),
    sweepRenewals(w, schoolsTeam),
    sweepApprovals(w),
    markOverdueInvoices(w),
  ]);
  const counts = [tasks.tasksOverdue, tasks.tasksDueSoon, schoolFollowUps, approvalsWaiting, partnershipRenewals];
  return {
    ranAt: now.toISOString(),
    durationMs: Math.round(performance.now() - started),
    ...tasks,
    schoolFollowUps,
    approvalsWaiting,
    partnershipRenewals,
    invoicesMarkedOverdue,
    notificationsCreated: counts.reduce((sum, c) => sum + c.notified, 0),
  };
}
