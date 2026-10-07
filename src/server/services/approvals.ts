import "server-only";
import { Prisma, type ApprovalStatus, type ApprovalType } from "@prisma/client";
import { formatZAR } from "@/lib/format";
import { APPROVAL_TYPE } from "@/lib/labels";
import type { Permission } from "@/lib/rbac";
import { audit } from "@/server/audit";
import { assertCan, can, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { notify } from "@/server/notify";
import { usersWithPermission } from "@/server/rbac";

/** Approval types a finance executive may decide on (approvals.decide.finance). */
export const FINANCE_APPROVAL_TYPES: ApprovalType[] = ["EXPENSE", "PURCHASE"];

const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

// ─────────────────────────── Access rules ───────────────────────────

/** Approvals a user may see: everything with approvals.read.all, otherwise their own, assigned, or decidable ones. */
export function approvalsVisibleWhere(user: SessionUser): Prisma.ApprovalWhereInput {
  if (can(user, "approvals.read.all")) return {};
  const or: Prisma.ApprovalWhereInput[] = [{ requesterId: user.id }, { approverId: user.id }];
  if (can(user, "approvals.decide.finance")) or.push({ type: { in: FINANCE_APPROVAL_TYPES } });
  return { OR: or };
}

/** Pending approvals this user could decide on now (excludes their own requests). */
export function approvalsAwaitingDecisionWhere(user: SessionUser): Prisma.ApprovalWhereInput {
  const base: Prisma.ApprovalWhereInput = { status: "PENDING", requesterId: { not: user.id } };
  if (can(user, "approvals.decide")) return base;
  const or: Prisma.ApprovalWhereInput[] = [{ approverId: user.id }];
  if (can(user, "approvals.decide.finance")) or.push({ type: { in: FINANCE_APPROVAL_TYPES } });
  return { ...base, OR: or };
}

export function canDecideApproval(
  user: SessionUser,
  approval: { requesterId: string; approverId: string | null; type: ApprovalType; status: ApprovalStatus },
): boolean {
  if (approval.status !== "PENDING") return false;
  // Segregation of duties: nobody approves their own request.
  if (approval.requesterId === user.id) return false;
  if (approval.approverId === user.id) return true;
  if (can(user, "approvals.decide")) return true;
  return can(user, "approvals.decide.finance") && FINANCE_APPROVAL_TYPES.includes(approval.type);
}

function deciderPermissions(type: ApprovalType): Permission[] {
  return FINANCE_APPROVAL_TYPES.includes(type) ? ["approvals.decide", "approvals.decide.finance"] : ["approvals.decide"];
}

// ─────────────────────────── Queries ───────────────────────────

export type ApprovalScope = "awaiting" | "mine" | "all";

export async function listApprovals(
  user: SessionUser,
  opts: {
    scope: ApprovalScope;
    q?: string;
    status?: ApprovalStatus;
    type?: ApprovalType;
    sort: "createdAt" | "dueDate" | "amount" | "number";
    dir: "asc" | "desc";
    skip: number;
    take: number;
  },
) {
  const scopeWhere: Prisma.ApprovalWhereInput =
    opts.scope === "awaiting"
      ? approvalsAwaitingDecisionWhere(user)
      : opts.scope === "mine"
        ? { requesterId: user.id }
        : approvalsVisibleWhere(user);
  const numberQuery = /^#?\d+$/.test(opts.q ?? "") ? Number((opts.q ?? "").replace("#", "")) : null;
  const where: Prisma.ApprovalWhereInput = {
    AND: [
      approvalsVisibleWhere(user),
      scopeWhere,
      opts.status ? { status: opts.status } : {},
      opts.type ? { type: opts.type } : {},
      opts.q
        ? {
            OR: [
              { title: { contains: opts.q, mode: "insensitive" } },
              { description: { contains: opts.q, mode: "insensitive" } },
              ...(numberQuery ? [{ number: numberQuery }] : []),
            ],
          }
        : {},
    ],
  };
  const [total, rows] = await Promise.all([
    db.approval.count({ where }),
    db.approval.findMany({
      where,
      orderBy: [{ [opts.sort]: { sort: opts.dir, nulls: "last" } }, { createdAt: "desc" }],
      skip: opts.skip,
      take: opts.take,
      include: {
        requester: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
      },
    }),
  ]);
  return {
    total,
    rows: rows.map((a) => ({ ...a, amount: num(a.amount), canDecide: canDecideApproval(user, a) })),
  };
}

export async function getApproval(user: SessionUser, id: string) {
  const approval = await db.approval.findFirst({
    where: { AND: [{ id }, approvalsVisibleWhere(user)] },
    include: {
      requester: { select: { id: true, name: true, jobTitle: true } },
      approver: { select: { id: true, name: true } },
      decisions: { orderBy: { createdAt: "asc" }, include: { decider: { select: { id: true, name: true, jobTitle: true } } } },
      expense: { select: { id: true, number: true, supplier: true, amount: true, status: true, category: true } },
      campaign: { select: { id: true, name: true, status: true, budget: true } },
      feature: { select: { id: true, title: true, status: true } },
      document: { select: { id: true, title: true } },
    },
  });
  if (!approval) throw new NotFoundError("Approval");
  return {
    ...approval,
    amount: num(approval.amount),
    expense: approval.expense ? { ...approval.expense, amount: Number(approval.expense.amount) } : null,
    campaign: approval.campaign ? { ...approval.campaign, budget: Number(approval.campaign.budget) } : null,
    canDecide: canDecideApproval(user, approval),
    isRequester: approval.requesterId === user.id,
  };
}

export async function pendingApprovalsForDashboard(user: SessionUser, take = 6) {
  const where = approvalsAwaitingDecisionWhere(user);
  const [total, rows] = await Promise.all([
    db.approval.count({ where }),
    db.approval.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take,
      include: { requester: { select: { name: true } } },
    }),
  ]);
  return { total, rows: rows.map((a) => ({ ...a, amount: num(a.amount) })) };
}

// ─────────────────────────── Mutations ───────────────────────────

export interface ApprovalInput {
  type: ApprovalType;
  title: string;
  description: string;
  amount?: number;
  priority: Prisma.ApprovalCreateInput["priority"];
  dueDate?: Date;
  approverId?: string;
  expenseId?: string;
  campaignId?: string;
  featureId?: string;
  documentId?: string;
}

const approvalLabel = (a: { number: number; type: ApprovalType; title: string }) =>
  `${APPROVAL_TYPE[a.type].label.toLowerCase()} approval #${a.number} “${a.title}”`;

export async function createApproval(user: SessionUser, input: ApprovalInput) {
  assertCan(user, "approvals.submit");
  if (input.approverId === user.id) throw new ValidationError("You cannot name yourself as the approver.", { approverId: ["Choose someone else."] });
  if (input.approverId) {
    const approver = await db.user.findFirst({ where: { id: input.approverId, status: "ACTIVE" } });
    if (!approver) throw new ValidationError("The selected approver is not an active user.");
  }
  if (input.expenseId) {
    const existing = await db.approval.findFirst({ where: { expenseId: input.expenseId, status: { in: ["PENDING", "CHANGES_REQUESTED"] } } });
    if (existing) throw new ValidationError(`Expense already has an open approval (#${existing.number}).`);
  }

  const approval = await db.$transaction(async (tx) => {
    const created = await tx.approval.create({
      data: {
        type: input.type,
        title: input.title,
        description: input.description,
        amount: input.amount ?? null,
        priority: input.priority,
        dueDate: input.dueDate ?? null,
        requesterId: user.id,
        approverId: input.approverId ?? null,
        expenseId: input.expenseId ?? null,
        campaignId: input.campaignId ?? null,
        featureId: input.featureId ?? null,
        documentId: input.documentId ?? null,
        decisions: { create: { deciderId: user.id, decision: "SUBMITTED", comment: null } },
      },
    });
    await audit(
      user,
      {
        action: "approval.submitted",
        module: "approvals",
        entityType: "Approval",
        entityId: created.id,
        summary: `${user.name} submitted ${approvalLabel(created)}${input.amount ? ` for ${formatZAR(input.amount)}` : ""}`,
        after: { type: created.type, title: created.title, amount: input.amount ?? null, approverId: created.approverId },
        feed: true,
      },
      tx,
    );
    return created;
  });

  const recipients = input.approverId ? [{ id: input.approverId }] : await usersWithPermission(deciderPermissions(input.type));
  await notify({
    userIds: recipients.map((r) => r.id),
    excludeUserId: user.id,
    type: "APPROVAL_REQUESTED",
    title: `Approval requested: ${approval.title}`,
    body: `${user.name} submitted a ${APPROVAL_TYPE[approval.type].label.toLowerCase()} request${input.amount ? ` for ${formatZAR(input.amount)}` : ""}.`,
    link: `/approvals/${approval.id}`,
  });
  return approval;
}

export async function decideApproval(
  user: SessionUser,
  input: { id: string; decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED"; comment?: string },
) {
  const approval = await db.approval.findUnique({ where: { id: input.id } });
  if (!approval) throw new NotFoundError("Approval");
  if (approval.requesterId === user.id) throw new ForbiddenError("You cannot decide on your own request.");
  if (!canDecideApproval(user, approval)) {
    if (approval.status !== "PENDING") throw new ValidationError("This request is no longer awaiting a decision.");
    throw new ForbiddenError("You are not an approver for this request.");
  }
  if (input.decision !== "APPROVED" && !input.comment) {
    throw new ValidationError("Add a comment explaining the decision.", { comment: ["A comment is required when rejecting or requesting changes."] });
  }

  const verb = { APPROVED: "approved", REJECTED: "rejected", CHANGES_REQUESTED: "requested changes to" }[input.decision];

  await db.$transaction(async (tx) => {
    // Optimistic concurrency: only transition if still pending.
    const updated = await tx.approval.updateMany({
      where: { id: approval.id, status: "PENDING" },
      data: { status: input.decision, decidedAt: input.decision === "CHANGES_REQUESTED" ? null : new Date() },
    });
    if (updated.count === 0) throw new ValidationError("Someone else has already decided on this request.");
    await tx.approvalDecision.create({
      data: { approvalId: approval.id, deciderId: user.id, decision: input.decision, comment: input.comment ?? null },
    });

    // Side effects on linked records.
    if (approval.expenseId && input.decision !== "CHANGES_REQUESTED") {
      const expense = await tx.expense.findUnique({ where: { id: approval.expenseId } });
      if (expense && expense.status === "PENDING_APPROVAL") {
        const status = input.decision === "APPROVED" ? "APPROVED" : "REJECTED";
        await tx.expense.update({ where: { id: expense.id }, data: { status } });
        await audit(
          user,
          {
            action: `expense.${status.toLowerCase()}`,
            module: "finance",
            entityType: "Expense",
            entityId: expense.id,
            summary: `${user.name} ${status === "APPROVED" ? "approved" : "rejected"} expense #${expense.number} (${expense.supplier}, ${formatZAR(Number(expense.amount))}) via approval #${approval.number}`,
            before: { status: expense.status },
            after: { status },
          },
          tx,
        );
      }
    }
    if (approval.campaignId && input.decision === "APPROVED") {
      await tx.campaign.updateMany({ where: { id: approval.campaignId, status: "DRAFT" }, data: { status: "PLANNING" } });
    }

    await audit(
      user,
      {
        action: `approval.${input.decision.toLowerCase()}`,
        module: "approvals",
        entityType: "Approval",
        entityId: approval.id,
        summary: `${user.name} ${verb} ${approvalLabel(approval)}${input.comment ? ` — “${input.comment.slice(0, 120)}”` : ""}`,
        before: { status: approval.status },
        after: { status: input.decision, comment: input.comment ?? null },
        feed: true,
      },
      tx,
    );
  });

  await notify({
    userIds: [approval.requesterId],
    type: "APPROVAL_DECIDED",
    title: `${user.name} ${verb} “${approval.title}”`,
    body: input.comment ?? null,
    link: `/approvals/${approval.id}`,
  });
}

export async function resubmitApproval(user: SessionUser, input: { id: string; comment?: string; description?: string; amount?: number }) {
  const approval = await db.approval.findUnique({ where: { id: input.id } });
  if (!approval) throw new NotFoundError("Approval");
  if (approval.requesterId !== user.id) throw new ForbiddenError("Only the requester can resubmit.");
  if (approval.status !== "CHANGES_REQUESTED") throw new ValidationError("Only requests with changes requested can be resubmitted.");

  await db.$transaction(async (tx) => {
    await tx.approval.update({
      where: { id: approval.id },
      data: {
        status: "PENDING",
        decidedAt: null,
        ...(input.description ? { description: input.description } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
      },
    });
    await tx.approvalDecision.create({
      data: { approvalId: approval.id, deciderId: user.id, decision: "RESUBMITTED", comment: input.comment ?? null },
    });
    await audit(
      user,
      {
        action: "approval.resubmitted",
        module: "approvals",
        entityType: "Approval",
        entityId: approval.id,
        summary: `${user.name} resubmitted ${approvalLabel(approval)}`,
        before: { status: approval.status, amount: num(approval.amount), description: approval.description },
        after: { status: "PENDING", amount: input.amount ?? num(approval.amount), description: input.description ?? approval.description },
      },
      tx,
    );
  });

  const deciders = await db.approvalDecision.findMany({
    where: { approvalId: approval.id, decision: "CHANGES_REQUESTED" },
    select: { deciderId: true },
  });
  await notify({
    userIds: approval.approverId ? [approval.approverId] : deciders.map((d) => d.deciderId),
    excludeUserId: user.id,
    type: "APPROVAL_REQUESTED",
    title: `Resubmitted for approval: ${approval.title}`,
    body: input.comment ?? null,
    link: `/approvals/${approval.id}`,
  });
}

export async function withdrawApproval(user: SessionUser, id: string) {
  const approval = await db.approval.findUnique({ where: { id } });
  if (!approval) throw new NotFoundError("Approval");
  if (approval.requesterId !== user.id) throw new ForbiddenError("Only the requester can withdraw a request.");
  if (!["PENDING", "CHANGES_REQUESTED"].includes(approval.status)) throw new ValidationError("This request can no longer be withdrawn.");
  await db.$transaction(async (tx) => {
    await tx.approval.update({ where: { id }, data: { status: "WITHDRAWN", decidedAt: new Date() } });
    await tx.approvalDecision.create({ data: { approvalId: id, deciderId: user.id, decision: "WITHDRAWN" } });
    await audit(
      user,
      {
        action: "approval.withdrawn",
        module: "approvals",
        entityType: "Approval",
        entityId: id,
        summary: `${user.name} withdrew ${approvalLabel(approval)}`,
        before: { status: approval.status },
        after: { status: "WITHDRAWN" },
      },
      tx,
    );
  });
}

/** Options for linking an approval to existing records. */
export async function approvalLinkOptions(user: SessionUser) {
  const [expenses, campaigns, features] = await Promise.all([
    can(user, "finance.read") || can(user, "finance.write")
      ? db.expense.findMany({
          where: { status: "PENDING_APPROVAL", approval: null },
          orderBy: { date: "desc" },
          take: 50,
          select: { id: true, number: true, supplier: true, amount: true },
        })
      : [],
    can(user, "marketing.read")
      ? db.campaign.findMany({ where: { status: { in: ["DRAFT", "PLANNING"] } }, orderBy: { startDate: "desc" }, take: 50, select: { id: true, name: true } })
      : [],
    can(user, "technology.read")
      ? db.feature.findMany({ where: { status: { in: ["TESTING", "IN_PROGRESS"] } }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, title: true } })
      : [],
  ]);
  return {
    expenses: expenses.map((e) => ({ value: e.id, label: `#${e.number} · ${e.supplier} · ${formatZAR(Number(e.amount))}` })),
    campaigns: campaigns.map((c) => ({ value: c.id, label: c.name })),
    features: features.map((f) => ({ value: f.id, label: f.title })),
  };
}
