import type { FieldDef, FieldOption, FormValues } from "@/components/forms/types";
import { toDateInput } from "@/lib/dates";
import { BUG_SEVERITY, BUG_STATUS, FEATURE_STATUS, optionsOf, PRIORITY } from "@/lib/labels";

export function featureFields(people: FieldOption[]): FieldDef[] {
  return [
    { type: "text", name: "title", label: "Feature", required: true, span: 2 },
    { type: "textarea", name: "description", label: "Description", rows: 3 },
    { type: "select", name: "priority", label: "Priority", required: true, options: optionsOf(PRIORITY) },
    { type: "select", name: "status", label: "Status", required: true, options: optionsOf(FEATURE_STATUS) },
    { type: "select", name: "ownerId", label: "Owner", options: people, emptyLabel: "Me" },
    { type: "date", name: "targetDate", label: "Deadline" },
  ];
}

export function featureDefaults(f?: { title: string; description: string | null; priority: string; status: string; ownerId: string | null; targetDate: Date | null }): FormValues {
  if (!f) return { priority: "MEDIUM", status: "BACKLOG" };
  return { title: f.title, description: f.description ?? "", priority: f.priority, status: f.status, ownerId: f.ownerId ?? "", targetDate: toDateInput(f.targetDate) };
}

export function bugFields(opts: { people: FieldOption[]; features: FieldOption[]; canTriage: boolean; isEdit: boolean }): FieldDef[] {
  return [
    { type: "text", name: "title", label: "Summary", required: true, span: 2, placeholder: "What's wrong, where?" },
    { type: "textarea", name: "description", label: "Steps to reproduce", rows: 4, placeholder: "1. …\n2. …\nExpected: …\nActual: …" },
    { type: "select", name: "severity", label: "Severity", required: true, options: optionsOf(BUG_SEVERITY) },
    { type: "text", name: "environment", label: "Environment", placeholder: "Android app 3.4.1, Chrome, iPad…" },
    ...(opts.canTriage
      ? ([
          { type: "select", name: "assigneeId", label: "Assigned developer", options: opts.people, emptyLabel: "Unassigned" },
          { type: "select", name: "featureId", label: "Related feature", options: opts.features, emptyLabel: "None" },
          ...(opts.isEdit ? [{ type: "select", name: "status", label: "Status", options: optionsOf(BUG_STATUS) }] : []),
        ] as FieldDef[])
      : []),
  ];
}
