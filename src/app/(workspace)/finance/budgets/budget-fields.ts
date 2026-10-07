import type { ExpenseCategory } from "@prisma/client";
import type { FieldDef, FieldOption, FormValues } from "@/components/forms/types";
import { BUDGET_TYPE, EXPENSE_CATEGORY, optionsOf } from "@/lib/labels";

export function budgetFields(departments: FieldOption[]): FieldDef[] {
  return [
    { type: "text", name: "name", label: "Budget name", required: true, span: 2, placeholder: "e.g. Marketing Budget 2027" },
    { type: "select", name: "type", label: "Type", required: true, options: optionsOf(BUDGET_TYPE) },
    { type: "number", name: "fiscalYear", label: "Fiscal year", required: true, min: 2020, max: 2100 },
    { type: "select", name: "departmentId", label: "Department", options: departments, emptyLabel: "Company-wide", span: 2, hint: "Department budgets compare against that department's expenses only." },
    { type: "heading", name: "lines", label: "Annual amount per category", description: "Leave blank for categories outside this budget." },
    ...(Object.keys(EXPENSE_CATEGORY) as ExpenseCategory[]).map((c) => ({ type: "money" as const, name: `line_${c}`, label: EXPENSE_CATEGORY[c].label })),
    { type: "textarea", name: "notes", label: "Notes", rows: 2 },
  ];
}

export function budgetDefaults(b?: { name: string; type: string; fiscalYear: number; departmentId: string | null; notes: string | null; lines: { category: string; amount: number }[] }): FormValues {
  if (!b) return { type: "DEPARTMENT", fiscalYear: String(new Date().getFullYear() + (new Date().getMonth() >= 9 ? 1 : 0)) };
  return {
    name: b.name,
    type: b.type,
    fiscalYear: String(b.fiscalYear),
    departmentId: b.departmentId ?? "",
    notes: b.notes ?? "",
    ...Object.fromEntries(b.lines.map((l) => [`line_${l.category}`, l.amount.toFixed(2)])),
  };
}
