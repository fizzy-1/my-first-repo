import type { FieldDef, FieldOption } from "@/components/forms/types";
import { APPROVAL_TYPE, optionsOf, PRIORITY } from "@/lib/labels";

export function approvalFields(opts: {
  approvers: FieldOption[];
  expenses: FieldOption[];
  campaigns: FieldOption[];
  features: FieldOption[];
}): FieldDef[] {
  return [
    { type: "select", name: "type", label: "Request type", required: true, options: optionsOf(APPROVAL_TYPE) },
    { type: "select", name: "priority", label: "Priority", required: true, options: optionsOf(PRIORITY) },
    { type: "text", name: "title", label: "Title", required: true, span: 2, maxLength: 160, placeholder: "e.g. Purchase two Rode lavalier microphones" },
    {
      type: "textarea",
      name: "description",
      label: "Business case",
      required: true,
      rows: 5,
      placeholder: "What is being requested, why, alternatives considered and the impact of not approving.",
    },
    { type: "money", name: "amount", label: "Amount (ZAR)", hint: "Leave blank if not financial." },
    { type: "date", name: "dueDate", label: "Decision needed by" },
    {
      type: "select",
      name: "approverId",
      label: "Named approver",
      options: opts.approvers,
      emptyLabel: "Any authorised approver",
      span: 2,
      hint: "Optional. Directors (and finance executives for expenses/purchases) can always decide.",
    },
    ...(opts.expenses.length || opts.campaigns.length || opts.features.length
      ? ([{ type: "heading", name: "links", label: "Link to an existing record", description: "Decisions update the linked record automatically (e.g. an approved expense becomes payable)." }] as FieldDef[])
      : []),
    ...(opts.expenses.length ? ([{ type: "select", name: "expenseId", label: "Expense", options: opts.expenses, emptyLabel: "None", span: 2 }] as FieldDef[]) : []),
    ...(opts.campaigns.length ? ([{ type: "select", name: "campaignId", label: "Campaign", options: opts.campaigns, emptyLabel: "None" }] as FieldDef[]) : []),
    ...(opts.features.length ? ([{ type: "select", name: "featureId", label: "Product release", options: opts.features, emptyLabel: "None" }] as FieldDef[]) : []),
  ];
}
