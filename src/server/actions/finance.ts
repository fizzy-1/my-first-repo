"use server";

import { BudgetType, ExpenseCategory, ExpenseStatus, IncomeCategory, IncomeStatus, PaymentMethod, ScenarioType } from "@prisma/client";
import { z } from "zod";
import { argAction, formAction } from "@/server/action";
import {
  zCheckbox,
  zDate,
  zDecimal,
  zEnum,
  zId,
  zInt,
  zMoney,
  zOptionalDate,
  zOptionalEnum,
  zOptionalId,
  zOptionalText,
  zPercentAsFraction,
  zPositiveMoney,
  zText,
} from "@/lib/validation";
import {
  createExpense,
  createIncome,
  deleteBudget,
  deleteExpense,
  deleteIncome,
  deleteProjection,
  markExpensePaid,
  markIncomeReceived,
  saveBudget,
  saveProjection,
  updateExpense,
  updateIncome,
} from "@/server/services/finance";

const incomeSchema = z.object({
  date: zDate,
  customer: zText(160, "Customer"),
  schoolId: zOptionalId,
  description: zText(500, "Description"),
  category: zEnum(IncomeCategory, "a category"),
  amount: zPositiveMoney,
  paymentMethod: zOptionalEnum(PaymentMethod),
  reference: zOptionalText(100),
  status: zEnum(IncomeStatus, "a status"),
  dueDate: zOptionalDate,
  receivedAt: zOptionalDate,
});

export const createIncomeAction = formAction(incomeSchema, async (user, input) => {
  const income = await createIncome(user, input);
  return { message: `Income INV-${income.number} recorded`, id: income.id };
});

export const updateIncomeAction = formAction(incomeSchema.extend({ id: zId }), async (user, { id, ...input }) => {
  await updateIncome(user, id, input);
  return "Income updated";
});

export const markIncomeReceivedAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await markIncomeReceived(user, id);
  return "Marked as received";
});

export const deleteIncomeAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteIncome(user, id);
  return "Income record deleted";
});

const expenseSchema = z.object({
  date: zDate,
  supplier: zText(160, "Supplier"),
  description: zText(500, "Description"),
  category: zEnum(ExpenseCategory, "a category"),
  departmentId: zOptionalId,
  amount: zPositiveMoney,
  status: zEnum(ExpenseStatus, "a status"),
  dueDate: zOptionalDate,
  paidAt: zOptionalDate,
  paymentMethod: zOptionalEnum(PaymentMethod),
  reference: zOptionalText(100),
  documentId: zOptionalId,
  requestApproval: zCheckbox,
});

export const createExpenseAction = formAction(expenseSchema, async (user, input) => {
  const expense = await createExpense(user, input);
  return {
    message: expense.status === "PENDING_APPROVAL" ? `Expense EXP-${expense.number} submitted for approval` : `Expense EXP-${expense.number} recorded`,
    id: expense.id,
  };
});

export const updateExpenseAction = formAction(expenseSchema.extend({ id: zId }), async (user, { id, ...input }) => {
  await updateExpense(user, id, input);
  return "Expense updated";
});

export const markExpensePaidAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await markExpensePaid(user, id);
  return "Marked as paid";
});

export const deleteExpenseAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteExpense(user, id);
  return "Expense deleted";
});

const budgetSchema = z
  .object({
    id: zOptionalId,
    name: zText(120, "Name"),
    type: zEnum(BudgetType, "a budget type"),
    fiscalYear: zInt(2020, 2100),
    departmentId: zOptionalId,
    notes: zOptionalText(2000),
  })
  .catchall(z.unknown());

export const saveBudgetAction = formAction(budgetSchema, async (user, input) => {
  const lines = (Object.keys(ExpenseCategory) as ExpenseCategory[])
    .map((category) => {
      const raw = input[`line_${category}`];
      const parsed = zMoney.optional().safeParse(typeof raw === "string" && raw.trim() === "" ? undefined : raw);
      return { category, amount: parsed.success ? (parsed.data ?? 0) : 0 };
    })
    .filter((l) => l.amount > 0);
  const id = await saveBudget(user, input.id ?? null, {
    name: input.name,
    type: input.type,
    fiscalYear: input.fiscalYear,
    departmentId: input.departmentId,
    notes: input.notes,
    lines,
  });
  return { message: input.id ? "Budget updated" : "Budget created", id };
});

export const deleteBudgetAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteBudget(user, id);
  return "Budget deleted";
});

const projectionSchema = z.object({
  id: zOptionalId,
  name: zText(120, "Name"),
  scenario: zEnum(ScenarioType, "a scenario"),
  startMonth: zDate,
  horizonMonths: zInt(1, 60),
  startingLearners: zInt(0, 10_000_000),
  monthlyNewLearners: zInt(0, 1_000_000),
  newLearnerGrowthRate: zPercentAsFraction(100),
  monthlyChurnRate: zPercentAsFraction(100),
  avgSubscriptionPrice: zMoney,
  schoolRevenueMonthly: zMoney,
  schoolRevenueGrowthRate: zPercentAsFraction(100),
  salariesMonthly: zMoney,
  salaryGrowthRate: zPercentAsFraction(100),
  marketingMonthly: zMoney,
  technologyMonthly: zMoney,
  otherExpensesMonthly: zMoney,
  startingCash: zDecimal(-1_000_000_000, 10_000_000_000),
  notes: zOptionalText(2000),
});

export const saveProjectionAction = formAction(projectionSchema, async (user, { id, ...input }) => {
  const saved = await saveProjection(user, id ?? null, input);
  return { message: id ? "Projection saved" : "Projection created", id: saved };
});

export const deleteProjectionAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteProjection(user, id);
  return "Projection deleted";
});
