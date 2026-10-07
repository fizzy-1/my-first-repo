import "server-only";
import { Prisma, type ExpenseCategory, type ExpenseStatus, type IncomeCategory, type IncomeStatus, type PaymentMethod, type ScenarioType, type BudgetType } from "@prisma/client";
import { addMonths, calendarDate, dbDate, monthKey, sastYear, startOfMonth, startOfYear } from "@/lib/dates";
import { formatMonth, formatZAR } from "@/lib/format";
import { EXPENSE_CATEGORY } from "@/lib/labels";
import { runProjection, type ProjectionInputs } from "@/lib/projections";
import { audit, diffFields } from "@/server/audit";
import { assertCan, can, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { sqlDate, sortBy } from "@/server/sql";
import { createApproval } from "./approvals";
import {
  cashBalanceAt,
  cashFlowSeries,
  cashPosition,
  currentPeriods,
  expensesTotal,
  receivablesAndPayables,
  revenueSeries,
  revenueTotal,
} from "./metrics";

/** Spend above this needs an approval before it can be paid (Expense & Approvals Policy). */
export const APPROVAL_THRESHOLD = 5_000;

const num = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : Number(d));

// ─────────────────────────── Overview ───────────────────────────

export async function financeOverview(user: SessionUser) {
  assertCan(user, "finance.read");
  const p = currentPeriods();
  const yearStart = startOfYear(p.now);
  const [revenueMtd, revenuePrev, expensesMtd, expensesPrev, cash, arap, series, byCategory, recentIncome, recentExpenses] = await Promise.all([
    revenueTotal(p.monthStart, p.todayEnd),
    revenueTotal(p.prevMonthStart, p.prevSamePeriodEnd),
    expensesTotal(p.monthStart, p.todayEnd),
    expensesTotal(p.prevMonthStart, p.prevSamePeriodEnd),
    cashPosition(p.now),
    receivablesAndPayables(),
    monthlyProfitAndLoss(12),
    expensesByCategory(yearStart, p.todayEnd),
    db.income.findMany({ orderBy: { date: "desc" }, take: 5, select: { id: true, number: true, customer: true, amount: true, status: true, date: true } }),
    db.expense.findMany({ orderBy: { date: "desc" }, take: 5, select: { id: true, number: true, supplier: true, amount: true, status: true, date: true } }),
  ]);
  return {
    periods: p,
    revenueMtd,
    revenuePrev,
    expensesMtd,
    expensesPrev,
    netMtd: revenueMtd.total - expensesMtd,
    netPrev: revenuePrev.total - expensesPrev,
    cash,
    arap,
    series,
    byCategory,
    recentIncome: recentIncome.map((i) => ({ ...i, amount: Number(i.amount) })),
    recentExpenses: recentExpenses.map((e) => ({ ...e, amount: Number(e.amount) })),
  };
}

/** Revenue vs expenses (accrual) per month for the last N months. */
export async function monthlyProfitAndLoss(months: number) {
  const now = new Date();
  const from = startOfMonth(addMonths(now, -(months - 1)));
  const window = { from, to: now, granularity: "month" as const, previousFrom: from };
  const [revenue, expenses] = await Promise.all([
    revenueSeries(window),
    db.$queryRaw<{ key: string; value: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('month', "date"::timestamp), 'YYYY-MM') AS key, SUM("amount")::float AS value
      FROM "Expense" WHERE "status" IN ('APPROVED', 'PAID') AND "date" >= ${sqlDate(dbDate(from))}
      GROUP BY 1`),
  ]);
  const exp = new Map(expenses.map((e) => [e.key, e.value]));
  return revenue.map((r) => {
    const e = Math.round(exp.get(r.key) ?? 0);
    return { key: r.key, label: r.label, revenue: r.total, expenses: e, net: r.total - e };
  });
}

export async function expensesByCategory(from: Date, to: Date) {
  const rows = await db.expense.groupBy({
    by: ["category"],
    where: { status: { in: ["APPROVED", "PAID"] }, date: { gte: dbDate(from), lt: dbDate(to) } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
  });
  return rows.map((r) => ({ category: r.category, label: EXPENSE_CATEGORY[r.category].label, amount: Number(r._sum.amount ?? 0) }));
}

// ─────────────────────────── Income ───────────────────────────

export type IncomeSort = "date" | "amount" | "customer" | "number" | "dueDate";

export async function listIncome(
  user: SessionUser,
  opts: { q?: string; status?: IncomeStatus; category?: IncomeCategory; from?: Date; to?: Date; sort: IncomeSort; dir: "asc" | "desc"; skip: number; take: number },
) {
  assertCan(user, "finance.read");
  const numberQuery = /^(INV-)?\d+$/i.test(opts.q ?? "") ? Number((opts.q ?? "").replace(/\D/g, "")) : null;
  const where: Prisma.IncomeWhereInput = {
    AND: [
      opts.status ? { status: opts.status } : {},
      opts.category ? { category: opts.category } : {},
      opts.from ? { date: { gte: opts.from } } : {},
      opts.to ? { date: { lte: opts.to } } : {},
      opts.q
        ? {
            OR: [
              { customer: { contains: opts.q, mode: "insensitive" } },
              { description: { contains: opts.q, mode: "insensitive" } },
              { reference: { contains: opts.q, mode: "insensitive" } },
              ...(numberQuery ? [{ number: numberQuery }] : []),
            ],
          }
        : {},
    ],
  };
  const [total, rows, sum] = await Promise.all([
    db.income.count({ where }),
    db.income.findMany({
      where,
      orderBy: [sortBy(opts.sort, opts.dir, ["dueDate"]), { number: "desc" }],
      skip: opts.skip,
      take: opts.take,
      include: { school: { select: { id: true, name: true } } },
    }),
    db.income.aggregate({ where, _sum: { amount: true } }),
  ]);
  return { total, sum: Number(sum._sum.amount ?? 0), rows: rows.map((r) => ({ ...r, amount: Number(r.amount) })) };
}

export interface IncomeInput {
  date: Date;
  customer: string;
  schoolId?: string;
  description: string;
  category: IncomeCategory;
  amount: number;
  paymentMethod?: PaymentMethod;
  reference?: string;
  status: IncomeStatus;
  dueDate?: Date;
  receivedAt?: Date;
}

function normaliseIncome(input: IncomeInput) {
  if (input.status === "RECEIVED" && !input.receivedAt) input.receivedAt = input.date;
  if (input.status !== "RECEIVED") input.receivedAt = undefined;
  return {
    date: input.date,
    customer: input.customer,
    schoolId: input.schoolId ?? null,
    description: input.description,
    category: input.category,
    amount: input.amount,
    paymentMethod: input.paymentMethod ?? null,
    reference: input.reference ?? null,
    status: input.status,
    dueDate: input.dueDate ?? null,
    receivedAt: input.receivedAt ?? null,
  };
}

export async function createIncome(user: SessionUser, input: IncomeInput) {
  assertCan(user, "finance.write");
  const data = normaliseIncome(input);
  const income = await db.income.create({ data: { ...data, createdById: user.id } });
  await audit(user, {
    action: "income.created",
    module: "finance",
    entityType: "Income",
    entityId: income.id,
    summary: `${user.name} recorded income INV-${income.number} from ${income.customer} (${formatZAR(input.amount)})`,
    after: data,
    feed: income.status === "RECEIVED",
  });
  return income;
}

export async function updateIncome(user: SessionUser, id: string, input: IncomeInput) {
  assertCan(user, "finance.write");
  const existing = await db.income.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Income record");
  const data = normaliseIncome(input);
  const changes = diffFields(existing, data);
  await db.income.update({ where: { id }, data });
  if (changes) {
    await audit(user, {
      action: "income.updated",
      module: "finance",
      entityType: "Income",
      entityId: id,
      summary: `${user.name} updated income INV-${existing.number} (${Object.keys(changes.after).join(", ")})`,
      ...changes,
    });
  }
}

export async function markIncomeReceived(user: SessionUser, id: string) {
  assertCan(user, "finance.write");
  const existing = await db.income.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Income record");
  if (existing.status === "RECEIVED") return;
  if (existing.status === "CANCELLED") throw new ValidationError("Cancelled invoices cannot be marked as received.");
  await db.income.update({ where: { id }, data: { status: "RECEIVED", receivedAt: dbDate(new Date()) } });
  await audit(user, {
    action: "income.received",
    module: "finance",
    entityType: "Income",
    entityId: id,
    summary: `Payment received from ${existing.customer}: INV-${existing.number} (${formatZAR(Number(existing.amount))})`,
    before: { status: existing.status },
    after: { status: "RECEIVED" },
    feed: true,
  });
}

export async function deleteIncome(user: SessionUser, id: string) {
  assertCan(user, "finance.write");
  const existing = await db.income.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Income record");
  await db.income.delete({ where: { id } });
  await audit(user, {
    action: "income.deleted",
    module: "finance",
    entityType: "Income",
    entityId: id,
    summary: `${user.name} deleted income INV-${existing.number} from ${existing.customer} (${formatZAR(Number(existing.amount))})`,
    before: { customer: existing.customer, amount: Number(existing.amount), status: existing.status, date: existing.date },
  });
}

// ─────────────────────────── Expenses ───────────────────────────

export type ExpenseSort = "date" | "amount" | "supplier" | "number" | "dueDate";

export async function listExpenses(
  user: SessionUser,
  opts: {
    q?: string;
    status?: ExpenseStatus;
    category?: ExpenseCategory;
    departmentId?: string;
    sort: ExpenseSort;
    dir: "asc" | "desc";
    skip: number;
    take: number;
  },
) {
  assertCan(user, "finance.read");
  const numberQuery = /^(EXP-)?\d+$/i.test(opts.q ?? "") ? Number((opts.q ?? "").replace(/\D/g, "")) : null;
  const where: Prisma.ExpenseWhereInput = {
    AND: [
      opts.status ? { status: opts.status } : {},
      opts.category ? { category: opts.category } : {},
      opts.departmentId ? { departmentId: opts.departmentId } : {},
      opts.q
        ? {
            OR: [
              { supplier: { contains: opts.q, mode: "insensitive" } },
              { description: { contains: opts.q, mode: "insensitive" } },
              { reference: { contains: opts.q, mode: "insensitive" } },
              ...(numberQuery ? [{ number: numberQuery }] : []),
            ],
          }
        : {},
    ],
  };
  const [total, rows, sum] = await Promise.all([
    db.expense.count({ where }),
    db.expense.findMany({
      where,
      orderBy: [sortBy(opts.sort, opts.dir, ["dueDate"]), { number: "desc" }],
      skip: opts.skip,
      take: opts.take,
      include: {
        department: { select: { name: true } },
        document: { select: { id: true, title: true } },
        approval: { select: { id: true, number: true, status: true } },
        submittedBy: { select: { name: true } },
      },
    }),
    db.expense.aggregate({ where, _sum: { amount: true } }),
  ]);
  return { total, sum: Number(sum._sum.amount ?? 0), rows: rows.map((r) => ({ ...r, amount: Number(r.amount) })) };
}

export interface ExpenseInput {
  date: Date;
  supplier: string;
  description: string;
  category: ExpenseCategory;
  departmentId?: string;
  amount: number;
  status: ExpenseStatus;
  dueDate?: Date;
  paidAt?: Date;
  paymentMethod?: PaymentMethod;
  reference?: string;
  documentId?: string;
  requestApproval?: boolean;
}

export async function createExpense(user: SessionUser, input: ExpenseInput) {
  assertCan(user, "finance.write");
  const needsApproval = input.amount > APPROVAL_THRESHOLD && (input.requestApproval || input.status === "PENDING_APPROVAL");
  const status: ExpenseStatus = needsApproval ? "PENDING_APPROVAL" : input.status;
  if (input.amount > APPROVAL_THRESHOLD && (status === "APPROVED" || status === "PAID") && !can(user, "approvals.decide.finance") && !can(user, "approvals.decide")) {
    throw new ValidationError(`Expenses above ${formatZAR(APPROVAL_THRESHOLD)} need approval. Tick “Submit for approval”.`);
  }
  const expense = await db.expense.create({
    data: {
      date: input.date,
      supplier: input.supplier,
      description: input.description,
      category: input.category,
      departmentId: input.departmentId ?? user.departmentId,
      amount: input.amount,
      status,
      dueDate: input.dueDate ?? null,
      paidAt: status === "PAID" ? (input.paidAt ?? input.date) : null,
      paymentMethod: input.paymentMethod ?? null,
      reference: input.reference ?? null,
      documentId: input.documentId ?? null,
      submittedById: user.id,
    },
  });
  await audit(user, {
    action: "expense.created",
    module: "finance",
    entityType: "Expense",
    entityId: expense.id,
    summary: `${user.name} recorded expense EXP-${expense.number}: ${expense.supplier} (${formatZAR(input.amount)})`,
    after: { supplier: expense.supplier, amount: input.amount, category: expense.category, status },
  });
  if (needsApproval) {
    await createApproval(user, {
      type: "EXPENSE",
      title: `${expense.supplier}: ${expense.description}`.slice(0, 160),
      description: `Expense EXP-${expense.number} recorded by ${user.name}.\n\n${expense.description}`,
      amount: input.amount,
      priority: input.amount > 25_000 ? "HIGH" : "MEDIUM",
      dueDate: input.dueDate,
      expenseId: expense.id,
    });
  }
  return expense;
}

export async function updateExpense(user: SessionUser, id: string, input: ExpenseInput) {
  assertCan(user, "finance.write");
  const existing = await db.expense.findUnique({ where: { id }, include: { approval: true } });
  if (!existing) throw new NotFoundError("Expense");
  // Status transitions out of PENDING_APPROVAL happen only through the approval workflow.
  if (existing.status === "PENDING_APPROVAL" && input.status !== "PENDING_APPROVAL" && existing.approval?.status === "PENDING") {
    throw new ValidationError("This expense is awaiting approval — decide on the approval request instead.");
  }
  if (existing.status === "REJECTED" && (input.status === "APPROVED" || input.status === "PAID")) {
    throw new ValidationError("A rejected expense cannot be paid. Submit a new approval request.");
  }
  const data = {
    date: input.date,
    supplier: input.supplier,
    description: input.description,
    category: input.category,
    departmentId: input.departmentId ?? null,
    amount: input.amount,
    status: input.status,
    dueDate: input.dueDate ?? null,
    paidAt: input.status === "PAID" ? (input.paidAt ?? existing.paidAt ?? dbDate(new Date())) : null,
    paymentMethod: input.paymentMethod ?? null,
    reference: input.reference ?? null,
    documentId: input.documentId ?? null,
  };
  const changes = diffFields(existing, data);
  await db.expense.update({ where: { id }, data });
  if (changes) {
    const amountChanged = "amount" in changes.after;
    await audit(user, {
      action: "expense.updated",
      module: "finance",
      entityType: "Expense",
      entityId: id,
      summary: amountChanged
        ? `${user.name} changed expense EXP-${existing.number} amount from ${formatZAR(Number(existing.amount), { cents: true })} to ${formatZAR(input.amount, { cents: true })}`
        : `${user.name} updated expense EXP-${existing.number} (${Object.keys(changes.after).join(", ")})`,
      ...changes,
    });
  }
}

export async function markExpensePaid(user: SessionUser, id: string) {
  assertCan(user, "finance.write");
  const existing = await db.expense.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Expense");
  if (existing.status === "PAID") return;
  if (existing.status !== "APPROVED") throw new ValidationError("Only approved expenses can be marked as paid.");
  await db.expense.update({ where: { id }, data: { status: "PAID", paidAt: dbDate(new Date()) } });
  await audit(user, {
    action: "expense.paid",
    module: "finance",
    entityType: "Expense",
    entityId: id,
    summary: `${user.name} paid ${existing.supplier}: EXP-${existing.number} (${formatZAR(Number(existing.amount))})`,
    before: { status: existing.status },
    after: { status: "PAID" },
    feed: true,
  });
}

export async function deleteExpense(user: SessionUser, id: string) {
  assertCan(user, "finance.write");
  const existing = await db.expense.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Expense");
  if (existing.status === "PAID") throw new ValidationError("Paid expenses cannot be deleted — record a correcting entry instead.");
  await db.expense.delete({ where: { id } });
  await audit(user, {
    action: "expense.deleted",
    module: "finance",
    entityType: "Expense",
    entityId: id,
    summary: `${user.name} deleted expense EXP-${existing.number}: ${existing.supplier} (${formatZAR(Number(existing.amount))})`,
    before: { supplier: existing.supplier, amount: Number(existing.amount), status: existing.status },
  });
}

export async function financeDocumentOptions() {
  const docs = await db.document.findMany({
    where: { category: "FINANCE", archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true },
  });
  return docs.map((d) => ({ value: d.id, label: d.title }));
}

// ─────────────────────────── Cash flow ───────────────────────────

export interface CashFlowRow {
  key: string;
  label: string;
  opening: number;
  capital: number;
  cashIn: number;
  cashOut: number;
  net: number;
  closing: number;
}

/**
 * Opening balance + capital injected + cash in − cash out = closing balance.
 * Monthly rows for a year, or one row per year since the first account opened.
 */
export async function cashFlowStatement(user: SessionUser, opts: { view: "monthly" | "annual"; year: number }) {
  assertCan(user, "finance.read");
  const accounts = await db.cashAccount.findMany({ where: { isActive: true } });
  const now = new Date();

  const capitalIn = (from: Date, to: Date) =>
    accounts.filter((a) => a.openingDate >= dbDate(from) && a.openingDate < dbDate(to)).reduce((s, a) => s + Number(a.openingBalance), 0);

  if (opts.view === "monthly") {
    const from = calendarDate(opts.year, 0, 1);
    const yearEnd = calendarDate(opts.year + 1, 0, 1);
    const sastFrom = startOfMonth(new Date(from.getTime() + 12 * 3_600_000));
    const to = yearEnd < now ? new Date(startOfMonth(new Date(yearEnd.getTime() + 12 * 3_600_000)).getTime() - 1) : now;
    if (sastFrom > now) return { rows: [] as CashFlowRow[], totals: null };
    const flows = await cashFlowSeries(sastFrom, to, "month");
    let opening = await cashBalanceAt(new Date(sastFrom.getTime() - 1));
    const rows: CashFlowRow[] = flows.map((f) => {
      const [y, m] = f.key.split("-").map(Number);
      const capital = capitalIn(calendarDate(y, m - 1, 1), calendarDate(y, m, 1));
      const closing = opening + capital + f.cashIn - f.cashOut;
      const row = { key: f.key, label: formatMonth(calendarDate(y, m - 1, 15)), opening, capital, cashIn: f.cashIn, cashOut: f.cashOut, net: f.cashIn - f.cashOut, closing };
      opening = closing;
      return row;
    });
    return { rows, totals: summarise(rows) };
  }

  const firstYear = accounts.length ? Math.min(...accounts.map((a) => a.openingDate.getUTCFullYear())) : sastYear(now);
  const rows: CashFlowRow[] = [];
  let opening = 0;
  for (let y = firstYear; y <= sastYear(now); y++) {
    const from = startOfMonth(new Date(Date.UTC(y, 0, 1, 12)));
    const to = y === sastYear(now) ? now : new Date(startOfMonth(new Date(Date.UTC(y + 1, 0, 1, 12))).getTime() - 1);
    const flows = await cashFlowSeries(from, to, "month");
    const cashIn = flows.reduce((s, f) => s + f.cashIn, 0);
    const cashOut = flows.reduce((s, f) => s + f.cashOut, 0);
    const capital = capitalIn(calendarDate(y, 0, 1), calendarDate(y + 1, 0, 1));
    const closing = opening + capital + cashIn - cashOut;
    rows.push({ key: String(y), label: `${y}${y === sastYear(now) ? " (YTD)" : ""}`, opening, capital, cashIn, cashOut, net: cashIn - cashOut, closing });
    opening = closing;
  }
  return { rows, totals: summarise(rows) };
}

function summarise(rows: CashFlowRow[]) {
  if (!rows.length) return null;
  return {
    opening: rows[0].opening,
    capital: rows.reduce((s, r) => s + r.capital, 0),
    cashIn: rows.reduce((s, r) => s + r.cashIn, 0),
    cashOut: rows.reduce((s, r) => s + r.cashOut, 0),
    closing: rows[rows.length - 1].closing,
  };
}

// ─────────────────────────── Budgets ───────────────────────────

async function budgetActuals(budget: { fiscalYear: number; departmentId: string | null; lines: { category: ExpenseCategory }[] }) {
  const rows = await db.expense.groupBy({
    by: ["category"],
    where: {
      status: { in: ["APPROVED", "PAID"] },
      date: { gte: calendarDate(budget.fiscalYear, 0, 1), lt: calendarDate(budget.fiscalYear + 1, 0, 1) },
      category: { in: budget.lines.map((l) => l.category) },
      ...(budget.departmentId ? { departmentId: budget.departmentId } : {}),
    },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.category, Number(r._sum.amount ?? 0)]));
}

/** Share of the fiscal year elapsed (for pro-rata budget comparison). */
export function yearElapsedShare(year: number, now = new Date()): number {
  const start = calendarDate(year, 0, 1).getTime();
  const end = calendarDate(year + 1, 0, 1).getTime();
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

export async function listBudgets(user: SessionUser, year: number) {
  assertCan(user, "finance.read");
  const budgets = await db.budget.findMany({
    where: { fiscalYear: year },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: { department: { select: { name: true } }, lines: true, createdBy: { select: { name: true } } },
  });
  return Promise.all(
    budgets.map(async (b) => {
      const actuals = await budgetActuals(b);
      const budgetTotal = b.lines.reduce((s, l) => s + Number(l.amount), 0);
      const actualTotal = [...actuals.values()].reduce((s, v) => s + v, 0);
      const overspent = b.lines.filter((l) => (actuals.get(l.category) ?? 0) > Number(l.amount)).length;
      return { ...b, lines: b.lines.map((l) => ({ ...l, amount: Number(l.amount), actual: actuals.get(l.category) ?? 0 })), budgetTotal, actualTotal, overspent };
    }),
  );
}

export async function getBudget(user: SessionUser, id: string) {
  assertCan(user, "finance.read");
  const b = await db.budget.findUnique({ where: { id }, include: { department: { select: { name: true } }, lines: true, createdBy: { select: { name: true } } } });
  if (!b) throw new NotFoundError("Budget");
  const actuals = await budgetActuals(b);
  // Monthly actuals for the lines in this budget.
  const monthly = await db.$queryRaw<{ key: string; value: number }[]>(Prisma.sql`
    SELECT to_char(date_trunc('month', "date"::timestamp), 'YYYY-MM') AS key, SUM("amount")::float AS value
    FROM "Expense"
    WHERE "status" IN ('APPROVED','PAID')
      AND "date" >= ${sqlDate(calendarDate(b.fiscalYear, 0, 1))} AND "date" < ${sqlDate(calendarDate(b.fiscalYear + 1, 0, 1))}
      AND "category"::text = ANY(${b.lines.map((l) => l.category)}::text[])
      ${b.departmentId ? Prisma.sql`AND "departmentId" = ${b.departmentId}` : Prisma.empty}
    GROUP BY 1 ORDER BY 1`);
  const budgetTotal = b.lines.reduce((s, l) => s + Number(l.amount), 0);
  const byMonth = new Map(monthly.map((m) => [m.key, m.value]));
  let cumulative = 0;
  const burndown = Array.from({ length: 12 }, (_, i) => {
    const key = `${b.fiscalYear}-${String(i + 1).padStart(2, "0")}`;
    const isFuture = key > monthKey(new Date());
    cumulative += byMonth.get(key) ?? 0;
    return {
      key,
      label: formatMonth(calendarDate(b.fiscalYear, i, 15)).split(" ")[0],
      actual: isFuture ? null : Math.round(cumulative),
      budget: Math.round((budgetTotal * (i + 1)) / 12),
    };
  });
  return {
    ...b,
    lines: b.lines
      .map((l) => ({ ...l, amount: Number(l.amount), actual: actuals.get(l.category) ?? 0 }))
      .sort((x, y) => y.amount - x.amount),
    budgetTotal,
    actualTotal: [...actuals.values()].reduce((s, v) => s + v, 0),
    burndown,
  };
}

export interface BudgetInput {
  name: string;
  type: BudgetType;
  fiscalYear: number;
  departmentId?: string;
  notes?: string;
  lines: { category: ExpenseCategory; amount: number }[];
}

export async function saveBudget(user: SessionUser, id: string | null, input: BudgetInput) {
  assertCan(user, "finance.budgets");
  const lines = input.lines.filter((l) => l.amount > 0);
  if (lines.length === 0) throw new ValidationError("Add at least one budget line with an amount.");
  if (id) {
    const existing = await db.budget.findUnique({ where: { id }, include: { lines: true } });
    if (!existing) throw new NotFoundError("Budget");
    await db.$transaction([
      db.budget.update({ where: { id }, data: { name: input.name, type: input.type, fiscalYear: input.fiscalYear, departmentId: input.departmentId ?? null, notes: input.notes ?? null } }),
      db.budgetLine.deleteMany({ where: { budgetId: id } }),
      db.budgetLine.createMany({ data: lines.map((l) => ({ budgetId: id, category: l.category, amount: l.amount })) }),
    ]);
    const before = Object.fromEntries(existing.lines.map((l) => [l.category, Number(l.amount)]));
    const after = Object.fromEntries(lines.map((l) => [l.category, l.amount]));
    await audit(user, {
      action: "budget.updated",
      module: "finance",
      entityType: "Budget",
      entityId: id,
      summary: `${user.name} updated budget “${input.name}” (${formatZAR(existing.lines.reduce((s, l) => s + Number(l.amount), 0))} → ${formatZAR(lines.reduce((s, l) => s + l.amount, 0))})`,
      before,
      after,
    });
    return id;
  }
  const budget = await db.budget.create({
    data: {
      name: input.name,
      type: input.type,
      fiscalYear: input.fiscalYear,
      departmentId: input.departmentId ?? null,
      notes: input.notes ?? null,
      createdById: user.id,
      lines: { create: lines },
    },
  });
  await audit(user, {
    action: "budget.created",
    module: "finance",
    entityType: "Budget",
    entityId: budget.id,
    summary: `${user.name} created budget “${input.name}” for FY${input.fiscalYear} (${formatZAR(lines.reduce((s, l) => s + l.amount, 0))})`,
    after: Object.fromEntries(lines.map((l) => [l.category, l.amount])),
    feed: true,
  });
  return budget.id;
}

export async function deleteBudget(user: SessionUser, id: string) {
  assertCan(user, "finance.budgets");
  const existing = await db.budget.findUnique({ where: { id }, include: { lines: true } });
  if (!existing) throw new NotFoundError("Budget");
  await db.budget.delete({ where: { id } });
  await audit(user, {
    action: "budget.deleted",
    module: "finance",
    entityType: "Budget",
    entityId: id,
    summary: `${user.name} deleted budget “${existing.name}”`,
    before: Object.fromEntries(existing.lines.map((l) => [l.category, Number(l.amount)])),
  });
}

// ─────────────────────────── Projections ───────────────────────────

export type ProjectionRecord = ProjectionInputs & { id: string; name: string; scenario: ScenarioType; startMonth: Date; notes: string | null; updatedAt: Date; createdBy: string };

export async function listProjections(user: SessionUser): Promise<ProjectionRecord[]> {
  assertCan(user, "finance.read");
  const rows = await db.financialProjection.findMany({ orderBy: [{ scenario: "asc" }, { updatedAt: "desc" }], include: { createdBy: { select: { name: true } } } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    scenario: r.scenario,
    startMonth: r.startMonth,
    notes: r.notes,
    updatedAt: r.updatedAt,
    createdBy: r.createdBy.name,
    horizonMonths: r.horizonMonths,
    startingLearners: r.startingLearners,
    monthlyNewLearners: r.monthlyNewLearners,
    newLearnerGrowthRate: Number(r.newLearnerGrowthRate),
    monthlyChurnRate: Number(r.monthlyChurnRate),
    avgSubscriptionPrice: Number(r.avgSubscriptionPrice),
    schoolRevenueMonthly: Number(r.schoolRevenueMonthly),
    schoolRevenueGrowthRate: Number(r.schoolRevenueGrowthRate),
    salariesMonthly: Number(r.salariesMonthly),
    salaryGrowthRate: Number(r.salaryGrowthRate),
    marketingMonthly: Number(r.marketingMonthly),
    technologyMonthly: Number(r.technologyMonthly),
    otherExpensesMonthly: Number(r.otherExpensesMonthly),
    startingCash: Number(r.startingCash),
  }));
}

/** Current actuals used to pre-fill a new projection. */
export async function projectionBaseline() {
  const now = new Date();
  const [cash, paying, school] = await Promise.all([
    cashBalanceAt(now),
    db.subscription.count({ where: { status: { in: ["ACTIVE", "PAST_DUE"] }, source: "DIRECT", mrr: { gt: 0 } } }),
    db.partnership.aggregate({ where: { status: "ACTIVE" }, _sum: { annualValue: true } }),
  ]);
  return { startingCash: Math.round(cash), startingLearners: paying, schoolRevenueMonthly: Math.round(Number(school._sum.annualValue ?? 0) / 12) };
}

export interface ProjectionSaveInput extends ProjectionInputs {
  name: string;
  scenario: ScenarioType;
  startMonth: Date;
  notes?: string;
}

export async function saveProjection(user: SessionUser, id: string | null, input: ProjectionSaveInput) {
  assertCan(user, "finance.projections");
  const data = {
    name: input.name,
    scenario: input.scenario,
    startMonth: input.startMonth,
    horizonMonths: input.horizonMonths,
    startingLearners: input.startingLearners,
    monthlyNewLearners: input.monthlyNewLearners,
    newLearnerGrowthRate: input.newLearnerGrowthRate,
    monthlyChurnRate: input.monthlyChurnRate,
    avgSubscriptionPrice: input.avgSubscriptionPrice,
    schoolRevenueMonthly: input.schoolRevenueMonthly,
    schoolRevenueGrowthRate: input.schoolRevenueGrowthRate,
    salariesMonthly: input.salariesMonthly,
    salaryGrowthRate: input.salaryGrowthRate,
    marketingMonthly: input.marketingMonthly,
    technologyMonthly: input.technologyMonthly,
    otherExpensesMonthly: input.otherExpensesMonthly,
    startingCash: input.startingCash,
    notes: input.notes ?? null,
  };
  const { summary } = runProjection(input);
  if (id) {
    const existing = await db.financialProjection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Projection");
    const changes = diffFields(existing, data);
    await db.financialProjection.update({ where: { id }, data });
    await audit(user, {
      action: "projection.updated",
      module: "finance",
      entityType: "FinancialProjection",
      entityId: id,
      summary: `${user.name} updated projection “${input.name}” (ending cash ${formatZAR(summary.endingCash)})`,
      ...(changes ?? {}),
    });
    return id;
  }
  const created = await db.financialProjection.create({ data: { ...data, createdById: user.id } });
  await audit(user, {
    action: "projection.created",
    module: "finance",
    entityType: "FinancialProjection",
    entityId: created.id,
    summary: `${user.name} created ${input.scenario.toLowerCase()} projection “${input.name}”`,
    after: data,
  });
  return created.id;
}

export async function deleteProjection(user: SessionUser, id: string) {
  assertCan(user, "finance.projections");
  const existing = await db.financialProjection.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Projection");
  await db.financialProjection.delete({ where: { id } });
  await audit(user, { action: "projection.deleted", module: "finance", entityType: "FinancialProjection", entityId: id, summary: `${user.name} deleted projection “${existing.name}”` });
}

export { num };
