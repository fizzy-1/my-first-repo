import type { FieldDef, FieldOption, FormValues } from "@/components/forms/types";
import { toDateInput } from "@/lib/dates";
import { EXPENSE_CATEGORY, EXPENSE_STATUS, INCOME_CATEGORY, INCOME_STATUS, optionsOf, PAYMENT_METHOD } from "@/lib/labels";

export function incomeFields(schools: FieldOption[]): FieldDef[] {
  return [
    { type: "text", name: "customer", label: "Customer", required: true, placeholder: "School, company or individual" },
    { type: "select", name: "schoolId", label: "Linked school", options: schools, emptyLabel: "Not a school" },
    { type: "text", name: "description", label: "Description", required: true, span: 2 },
    { type: "select", name: "category", label: "Category", required: true, options: optionsOf(INCOME_CATEGORY) },
    { type: "money", name: "amount", label: "Amount", required: true },
    { type: "date", name: "date", label: "Invoice date", required: true },
    { type: "date", name: "dueDate", label: "Due date" },
    { type: "select", name: "status", label: "Status", required: true, options: optionsOf(INCOME_STATUS) },
    { type: "date", name: "receivedAt", label: "Date received", hint: "Defaults to the invoice date when status is Received." },
    { type: "select", name: "paymentMethod", label: "Payment method", options: optionsOf(PAYMENT_METHOD), emptyLabel: "—" },
    { type: "text", name: "reference", label: "Reference", maxLength: 100 },
  ];
}

export function incomeDefaults(i?: {
  date: Date;
  customer: string;
  schoolId: string | null;
  description: string;
  category: string;
  amount: number;
  paymentMethod: string | null;
  reference: string | null;
  status: string;
  dueDate: Date | null;
  receivedAt: Date | null;
}): FormValues {
  if (!i) return { date: toDateInput(new Date()), status: "INVOICED", category: "SCHOOL_CONTRACT", paymentMethod: "EFT" };
  return {
    date: toDateInput(i.date),
    customer: i.customer,
    schoolId: i.schoolId ?? "",
    description: i.description,
    category: i.category,
    amount: i.amount.toFixed(2),
    paymentMethod: i.paymentMethod ?? "",
    reference: i.reference ?? "",
    status: i.status,
    dueDate: toDateInput(i.dueDate),
    receivedAt: toDateInput(i.receivedAt),
  };
}

export function expenseFields(opts: { departments: FieldOption[]; documents: FieldOption[]; isNew: boolean }): FieldDef[] {
  return [
    { type: "text", name: "supplier", label: "Supplier", required: true },
    { type: "select", name: "category", label: "Category", required: true, options: optionsOf(EXPENSE_CATEGORY) },
    { type: "text", name: "description", label: "Description", required: true, span: 2 },
    { type: "money", name: "amount", label: "Amount (incl. VAT)", required: true },
    { type: "select", name: "departmentId", label: "Department", options: opts.departments, emptyLabel: "My department" },
    { type: "date", name: "date", label: "Expense date", required: true },
    { type: "date", name: "dueDate", label: "Payment due" },
    {
      type: "select",
      name: "status",
      label: "Status",
      required: true,
      options: optionsOf(EXPENSE_STATUS, opts.isNew ? ["PENDING_APPROVAL", "APPROVED", "PAID"] : undefined),
    },
    { type: "date", name: "paidAt", label: "Date paid" },
    { type: "select", name: "paymentMethod", label: "Payment method", options: optionsOf(PAYMENT_METHOD), emptyLabel: "—" },
    { type: "text", name: "reference", label: "Reference / PO", maxLength: 100 },
    { type: "select", name: "documentId", label: "Supporting document", options: opts.documents, emptyLabel: "None attached", span: 2, hint: "Upload invoices and receipts to Documents › Finance first." },
    ...(opts.isNew
      ? ([
          {
            type: "checkbox",
            name: "requestApproval",
            label: "Submit for approval",
            description: "Required for spend above R5,000. Creates an approval request; the expense becomes payable once approved.",
            span: 2,
          },
        ] as FieldDef[])
      : []),
  ];
}

export function expenseDefaults(e?: {
  date: Date;
  supplier: string;
  description: string;
  category: string;
  departmentId: string | null;
  amount: number;
  status: string;
  dueDate: Date | null;
  paidAt: Date | null;
  paymentMethod: string | null;
  reference: string | null;
  documentId: string | null;
}): FormValues {
  if (!e) return { date: toDateInput(new Date()), status: "PENDING_APPROVAL", category: "SOFTWARE", requestApproval: true };
  return {
    date: toDateInput(e.date),
    supplier: e.supplier,
    description: e.description,
    category: e.category,
    departmentId: e.departmentId ?? "",
    amount: e.amount.toFixed(2),
    status: e.status,
    dueDate: toDateInput(e.dueDate),
    paidAt: toDateInput(e.paidAt),
    paymentMethod: e.paymentMethod ?? "",
    reference: e.reference ?? "",
    documentId: e.documentId ?? "",
  };
}
