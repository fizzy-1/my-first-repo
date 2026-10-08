import "server-only";
import type { Prisma } from "@prisma/client";
import { formatZAR } from "@/lib/format";
import { APPROVAL_STATUS, DOCUMENT_CATEGORY, MEETING_TYPE, SCHOOL_STAGE, TASK_STATUS } from "@/lib/labels";
import { can, canAny, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { approvalsVisibleWhere } from "./approvals";
import { meetingsVisibleWhere } from "./access";
import { documentsVisibleWhere } from "./document-access";
import { tasksVisibleWhere } from "./tasks";

export interface SearchGroup {
  category: string;
  items: { id: string; title: string; subtitle?: string; href: string }[];
}

/**
 * Global search across modules. Each category is only queried when the user may
 * access it, and every query applies the same visibility filter as its module.
 */
export async function globalSearch(user: SessionUser, rawQuery: string, perCategory = 5): Promise<SearchGroup[]> {
  const q = rawQuery.trim().slice(0, 100);
  if (q.length < 2) return [];
  const contains = { contains: q, mode: "insensitive" as const };
  const num = /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : null;
  const take = perCategory;

  const jobs: Promise<SearchGroup | null>[] = [];

  if (can(user, "team.read")) {
    jobs.push(
      db.user
        .findMany({
          where: { status: { not: "OFFBOARDED" }, OR: [{ name: contains }, { email: contains }, { jobTitle: contains }] },
          take,
          select: { id: true, name: true, jobTitle: true, role: { select: { name: true } } },
        })
        .then((rows) => ({ category: "People", items: rows.map((u) => ({ id: u.id, title: u.name, subtitle: u.jobTitle ?? u.role.name, href: `/team/${u.id}` })) })),
    );
  }

  jobs.push(
    db.task
      .findMany({
        where: { AND: [tasksVisibleWhere(user), { OR: [{ title: contains }, { description: contains }, ...(num ? [{ number: num }] : [])] }] },
        take,
        orderBy: { updatedAt: "desc" },
        select: { id: true, number: true, title: true, status: true },
      })
      .then((rows) => ({ category: "Tasks", items: rows.map((t) => ({ id: t.id, title: t.title, subtitle: `#${t.number} · ${TASK_STATUS[t.status].label}`, href: `/tasks/${t.id}` })) })),
  );

  jobs.push(
    db.project
      .findMany({ where: { OR: [{ name: contains }, { description: contains }] }, take, select: { id: true, name: true, status: true } })
      .then((rows) => ({ category: "Projects", items: rows.map((p) => ({ id: p.id, title: p.name, href: `/tasks?scope=all&project=${p.id}` })) })),
  );

  if (can(user, "schools.read")) {
    jobs.push(
      db.school
        .findMany({
          where: { OR: [{ name: contains }, { city: contains }, { emisNumber: contains }, { contacts: { some: { name: contains } } }] },
          take,
          select: { id: true, name: true, city: true, stage: true },
        })
        .then((rows) => ({ category: "Schools", items: rows.map((s) => ({ id: s.id, title: s.name, subtitle: `${s.city} · ${SCHOOL_STAGE[s.stage].label}`, href: `/schools/${s.id}` })) })),
    );
  }

  if (can(user, "documents.read")) {
    jobs.push(
      db.document
        .findMany({
          where: {
            AND: [
              documentsVisibleWhere(user),
              { archivedAt: null },
              { OR: [{ title: contains }, { description: contains }, { tags: { some: { tag: { name: contains } } } }] },
            ],
          },
          take,
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true, category: true },
        })
        .then((rows) => ({ category: "Documents", items: rows.map((d) => ({ id: d.id, title: d.title, subtitle: DOCUMENT_CATEGORY[d.category].label, href: `/documents/${d.id}` })) })),
    );
  }

  jobs.push(
    db.meeting
      .findMany({
        where: { AND: [meetingsVisibleWhere(user), { OR: [{ title: contains }, { agenda: contains }, { notes: contains }] }] },
        take,
        orderBy: { startsAt: "desc" },
        select: { id: true, title: true, type: true, startsAt: true },
      })
      .then((rows) => ({ category: "Meetings", items: rows.map((m) => ({ id: m.id, title: m.title, subtitle: MEETING_TYPE[m.type].label, href: `/meetings/${m.id}` })) })),
  );

  jobs.push(
    db.approval
      .findMany({
        where: { AND: [approvalsVisibleWhere(user), { OR: [{ title: contains }, ...(num ? [{ number: num }] : [])] }] },
        take,
        orderBy: { createdAt: "desc" },
        select: { id: true, number: true, title: true, status: true },
      })
      .then((rows) => ({ category: "Approvals", items: rows.map((a) => ({ id: a.id, title: a.title, subtitle: `#${a.number} · ${APPROVAL_STATUS[a.status].label}`, href: `/approvals/${a.id}` })) })),
  );

  if (can(user, "finance.read")) {
    jobs.push(
      Promise.all([
        db.income.findMany({
          where: { OR: [{ customer: contains }, { description: contains }, { reference: contains }, ...(num ? [{ number: num }] : [])] },
          take: 3,
          orderBy: { date: "desc" },
          select: { id: true, number: true, customer: true, amount: true },
        }),
        db.expense.findMany({
          where: { OR: [{ supplier: contains }, { description: contains }, { reference: contains }, ...(num ? [{ number: num }] : [])] },
          take: 3,
          orderBy: { date: "desc" },
          select: { id: true, number: true, supplier: true, amount: true },
        }),
      ]).then(([income, expenses]) => ({
        category: "Financial records",
        items: [
          ...income.map((i) => ({ id: `inc-${i.id}`, title: `INV-${i.number} · ${i.customer}`, subtitle: `Income · ${formatZAR(Number(i.amount))}`, href: `/finance/income?q=${i.number}` })),
          ...expenses.map((e) => ({ id: `exp-${e.id}`, title: `EXP-${e.number} · ${e.supplier}`, subtitle: `Expense · ${formatZAR(Number(e.amount))}`, href: `/finance/expenses?q=${e.number}` })),
        ],
      })),
    );
  }

  if (canAny(user, ["marketing.read", "marketing.read.assigned"])) {
    const scope: Prisma.CampaignWhereInput = can(user, "marketing.read") ? {} : { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] };
    jobs.push(
      db.campaign
        .findMany({ where: { AND: [scope, { OR: [{ name: contains }, { description: contains }] }] }, take, select: { id: true, name: true, status: true } })
        .then((rows) => ({ category: "Campaigns", items: rows.map((c) => ({ id: c.id, title: c.name, href: `/marketing/${c.id}` })) })),
    );
  }

  if (canAny(user, ["technology.read", "technology.read.assigned"])) {
    const scope: Prisma.BugWhereInput = can(user, "technology.read") ? {} : { OR: [{ assigneeId: user.id }, { reporterId: user.id }] };
    jobs.push(
      db.bug
        .findMany({ where: { AND: [scope, { OR: [{ title: contains }, ...(num ? [{ number: num }] : [])] }] }, take, select: { id: true, number: true, title: true } })
        .then((rows) => ({ category: "Bugs", items: rows.map((b) => ({ id: b.id, title: b.title, subtitle: `Bug #${b.number}`, href: `/technology/bugs?q=${b.number}` })) })),
    );
  }

  const groups = await Promise.all(jobs);
  return groups.filter((g): g is SearchGroup => !!g && g.items.length > 0);
}
