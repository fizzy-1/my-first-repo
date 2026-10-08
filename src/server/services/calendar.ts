import "server-only";
import type { Prisma } from "@prisma/client";
import { addDays, dbDate, endOfSastDay } from "@/lib/dates";
import { formatZAR } from "@/lib/format";
import { CAMPAIGN_CHANNEL, CONTENT_TYPE, MEETING_TYPE } from "@/lib/labels";
import { can, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { meetingsVisibleWhere } from "./access";
import { approvalsAwaitingDecisionWhere } from "./approvals";
import { tasksVisibleWhere } from "./tasks";

export type CalendarKind =
  | "meeting"
  | "task"
  | "approval"
  | "contract"
  | "receivable"
  | "payable"
  | "campaign"
  | "content"
  | "followup"
  | "objective"
  | "release";

export interface CalendarEvent {
  id: string;
  kind: CalendarKind;
  title: string;
  subtitle?: string;
  /** ISO instant. All-day items use the end of their SAST day. */
  at: string;
  allDay: boolean;
  href: string;
  /** Overdue or otherwise urgent. */
  urgent?: boolean;
}

export const CALENDAR_KINDS: Record<CalendarKind, { label: string; tone: "primary" | "info" | "success" | "warning" | "danger" | "violet" | "neutral" }> = {
  meeting: { label: "Meeting", tone: "violet" },
  task: { label: "Task due", tone: "info" },
  approval: { label: "Approval due", tone: "warning" },
  contract: { label: "Contract", tone: "primary" },
  receivable: { label: "Payment due in", tone: "success" },
  payable: { label: "Payment due out", tone: "danger" },
  campaign: { label: "Campaign", tone: "warning" },
  content: { label: "Content deadline", tone: "info" },
  followup: { label: "School follow-up", tone: "primary" },
  objective: { label: "Objective deadline", tone: "violet" },
  release: { label: "Release target", tone: "info" },
};

/** Meetings a user may see: all (meetings.read.all) or those they organise / attend. */

/**
 * Every dated item in [from, to] the user is allowed to see, across modules.
 * Each source is gated by the same permission that guards its module.
 */
export async function getCalendarEvents(
  user: SessionUser,
  from: Date,
  to: Date,
  opts: { kinds?: CalendarKind[]; includeOverdue?: boolean } = {},
): Promise<CalendarEvent[]> {
  const want = (k: CalendarKind) => !opts.kinds || opts.kinds.includes(k);
  const now = new Date();
  const dFrom = dbDate(from);
  const dTo = dbDate(to);
  const lowerTs = opts.includeOverdue ? undefined : from;
  const lowerDate = opts.includeOverdue ? undefined : dFrom;
  const events: CalendarEvent[] = [];
  const allDay = (date: Date) => endOfSastDay(date).toISOString();

  const jobs: Promise<void>[] = [];

  if (want("meeting")) {
    jobs.push(
      db.meeting
        .findMany({
          where: { AND: [meetingsVisibleWhere(user), { startsAt: { gte: from, lte: to }, status: { not: "CANCELLED" } }] },
          select: { id: true, title: true, type: true, startsAt: true, location: true },
          orderBy: { startsAt: "asc" },
          take: 200,
        })
        .then((rows) => {
          for (const m of rows)
            events.push({
              id: `meeting-${m.id}`,
              kind: "meeting",
              title: m.title,
              subtitle: [MEETING_TYPE[m.type].label, m.location].filter(Boolean).join(" · "),
              at: m.startsAt.toISOString(),
              allDay: false,
              href: `/meetings/${m.id}`,
            });
        }),
    );
  }

  if (want("task")) {
    jobs.push(
      db.task
        .findMany({
          where: {
            AND: [
              tasksVisibleWhere(user),
              { status: { not: "COMPLETED" }, dueDate: { gte: lowerTs, lte: to } },
              // On shared views keep the signal high: own tasks plus high-priority ones.
              { OR: [{ assigneeId: user.id }, { priority: { in: ["HIGH", "CRITICAL"] } }] },
            ],
          },
          select: { id: true, number: true, title: true, dueDate: true, assignee: { select: { name: true } } },
          orderBy: { dueDate: "asc" },
          take: 200,
        })
        .then((rows) => {
          for (const t of rows)
            events.push({
              id: `task-${t.id}`,
              kind: "task",
              title: t.title,
              subtitle: `#${t.number}${t.assignee ? ` · ${t.assignee.name}` : ""}`,
              at: t.dueDate!.toISOString(),
              allDay: true,
              href: `/tasks/${t.id}`,
              urgent: t.dueDate! < now,
            });
        }),
    );
  }

  if (want("approval")) {
    jobs.push(
      db.approval
        .findMany({
          where: { AND: [approvalsAwaitingDecisionWhere(user), { dueDate: { gte: lowerDate, lte: dTo } }] },
          select: { id: true, number: true, title: true, dueDate: true, amount: true },
          take: 100,
        })
        .then((rows) => {
          for (const a of rows)
            events.push({
              id: `approval-${a.id}`,
              kind: "approval",
              title: `Decision due: ${a.title}`,
              subtitle: `#${a.number}${a.amount ? ` · ${formatZAR(Number(a.amount))}` : ""}`,
              at: allDay(a.dueDate!),
              allDay: true,
              href: `/approvals/${a.id}`,
              urgent: endOfSastDay(a.dueDate!) < now,
            });
        }),
    );
  }

  if (can(user, "schools.read")) {
    if (want("contract")) {
      jobs.push(
        db.partnership
          .findMany({
            where: { status: { in: ["ACTIVE", "SIGNED"] }, endDate: { gte: lowerDate ?? dbDate(addDays(now, -30)), lte: dTo } },
            select: { id: true, endDate: true, annualValue: true, school: { select: { id: true, name: true } } },
            take: 100,
          })
          .then((rows) => {
            for (const p of rows)
              events.push({
                id: `contract-${p.id}`,
                kind: "contract",
                title: `Partnership renewal: ${p.school.name}`,
                subtitle: `Contract ends · ${formatZAR(Number(p.annualValue))}/yr`,
                at: allDay(p.endDate!),
                allDay: true,
                href: `/schools/${p.school.id}`,
                urgent: endOfSastDay(p.endDate!) < addDays(now, 14),
              });
          }),
      );
    }
    if (want("followup")) {
      jobs.push(
        db.school
          .findMany({
            where: { nextFollowUpAt: { gte: lowerTs, lte: to }, stage: { notIn: ["LOST"] } },
            select: { id: true, name: true, nextFollowUpAt: true, stage: true, owner: { select: { name: true } } },
            take: 100,
          })
          .then((rows) => {
            for (const s of rows)
              events.push({
                id: `followup-${s.id}`,
                kind: "followup",
                title: `Follow up: ${s.name}`,
                subtitle: s.owner?.name,
                at: s.nextFollowUpAt!.toISOString(),
                allDay: true,
                href: `/schools/${s.id}`,
                urgent: s.nextFollowUpAt! < now,
              });
          }),
      );
    }
  }

  if (can(user, "finance.read")) {
    if (want("receivable")) {
      jobs.push(
        db.income
          .findMany({
            where: { status: { in: ["INVOICED", "OVERDUE"] }, dueDate: { gte: lowerDate, lte: dTo } },
            select: { id: true, number: true, customer: true, amount: true, dueDate: true, status: true },
            take: 100,
          })
          .then((rows) => {
            for (const i of rows)
              events.push({
                id: `receivable-${i.id}`,
                kind: "receivable",
                title: `Payment due from ${i.customer}`,
                subtitle: `INV-${i.number} · ${formatZAR(Number(i.amount))}`,
                at: allDay(i.dueDate!),
                allDay: true,
                href: `/finance/income?q=${encodeURIComponent(i.customer)}`,
                urgent: i.status === "OVERDUE",
              });
          }),
      );
    }
    if (want("payable")) {
      jobs.push(
        db.expense
          .findMany({
            where: { status: "APPROVED", dueDate: { gte: lowerDate, lte: dTo } },
            select: { id: true, number: true, supplier: true, amount: true, dueDate: true },
            take: 100,
          })
          .then((rows) => {
            for (const e of rows)
              events.push({
                id: `payable-${e.id}`,
                kind: "payable",
                title: `Pay ${e.supplier}`,
                subtitle: `EXP-${e.number} · ${formatZAR(Number(e.amount))}`,
                at: allDay(e.dueDate!),
                allDay: true,
                href: `/finance/expenses?q=${encodeURIComponent(e.supplier)}`,
                urgent: endOfSastDay(e.dueDate!) < now,
              });
          }),
      );
    }
  }

  if (want("campaign") && (can(user, "marketing.read") || can(user, "marketing.read.assigned"))) {
    const scope: Prisma.CampaignWhereInput = can(user, "marketing.read")
      ? {}
      : { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] };
    jobs.push(
      db.campaign
        .findMany({
          where: {
            AND: [scope, { OR: [{ startDate: { gte: dFrom, lte: dTo } }, { endDate: { gte: dFrom, lte: dTo } }] }, { status: { not: "COMPLETED" } }],
          },
          select: { id: true, name: true, startDate: true, endDate: true, channel: true },
          take: 100,
        })
        .then((rows) => {
          for (const c of rows) {
            if (c.startDate >= dFrom && c.startDate <= dTo)
              events.push({ id: `campaign-start-${c.id}`, kind: "campaign", title: `Launch: ${c.name}`, subtitle: CAMPAIGN_CHANNEL[c.channel].label, at: allDay(c.startDate), allDay: true, href: `/marketing/${c.id}` });
            if (c.endDate && c.endDate >= dFrom && c.endDate <= dTo)
              events.push({ id: `campaign-end-${c.id}`, kind: "campaign", title: `Ends: ${c.name}`, subtitle: CAMPAIGN_CHANNEL[c.channel].label, at: allDay(c.endDate), allDay: true, href: `/marketing/${c.id}` });
          }
        }),
    );
  }

  if (want("content") && (can(user, "academic.read") || can(user, "academic.read.assigned"))) {
    const scope: Prisma.ContentItemWhereInput = can(user, "academic.read") ? {} : { OR: [{ assigneeId: user.id }, { reviewerId: user.id }] };
    jobs.push(
      db.contentItem
        .findMany({
          where: { AND: [scope, { stage: { not: "PUBLISHED" }, dueDate: { gte: lowerDate, lte: dTo } }] },
          select: { id: true, title: true, type: true, dueDate: true, assignee: { select: { name: true } } },
          take: 150,
        })
        .then((rows) => {
          for (const c of rows)
            events.push({
              id: `content-${c.id}`,
              kind: "content",
              title: c.title,
              subtitle: [CONTENT_TYPE[c.type].label, c.assignee?.name].filter(Boolean).join(" · "),
              at: allDay(c.dueDate!),
              allDay: true,
              href: `/academic?q=${encodeURIComponent(c.title)}`,
              urgent: endOfSastDay(c.dueDate!) < now,
            });
        }),
    );
  }

  if (want("objective") && can(user, "strategy.read")) {
    jobs.push(
      db.objective
        .findMany({
          where: { status: { not: "COMPLETED" }, deadline: { gte: lowerDate, lte: dTo } },
          select: { id: true, title: true, deadline: true, owner: { select: { name: true } } },
          take: 50,
        })
        .then((rows) => {
          for (const o of rows)
            events.push({ id: `objective-${o.id}`, kind: "objective", title: o.title, subtitle: o.owner.name, at: allDay(o.deadline), allDay: true, href: `/strategy/${o.id}` });
        }),
    );
  }

  if (want("release") && (can(user, "technology.read") || can(user, "technology.read.assigned"))) {
    jobs.push(
      db.feature
        .findMany({
          where: { status: { not: "RELEASED" }, targetDate: { gte: lowerDate, lte: dTo } },
          select: { id: true, title: true, targetDate: true, owner: { select: { name: true } } },
          take: 50,
        })
        .then((rows) => {
          for (const f of rows)
            events.push({ id: `release-${f.id}`, kind: "release", title: `Release: ${f.title}`, subtitle: f.owner?.name, at: allDay(f.targetDate!), allDay: true, href: "/technology" });
        }),
    );
  }

  await Promise.all(jobs);
  return events.sort((a, b) => a.at.localeCompare(b.at));
}
