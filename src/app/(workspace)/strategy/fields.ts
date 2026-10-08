import type { ObjectiveMetric, ObjectiveStatus } from "@prisma/client";
import type { FieldDef, FieldOption, FormValues } from "@/components/forms/types";
import { calendarDate, toDateInput } from "@/lib/dates";
import { OBJECTIVE_METRIC, OBJECTIVE_STATUS, optionsOf } from "@/lib/labels";
import { formatObjectiveValue } from "./objective-ui";

export const PERIOD_OPTIONS: FieldOption[] = [
  { value: "annual", label: "Annual objective" },
  { value: "1", label: "Q1 (Jan – Mar)" },
  { value: "2", label: "Q2 (Apr – Jun)" },
  { value: "3", label: "Q3 (Jul – Sep)" },
  { value: "4", label: "Q4 (Oct – Dec)" },
];

/** Planning years offered in the form: around the year being viewed and the current year. */
export function yearOptions(years: number[]): FieldOption[] {
  return [...new Set(years)].sort((a, b) => a - b).map((y) => ({ value: String(y), label: String(y) }));
}

export function objectiveFields(opts: {
  years: FieldOption[];
  owners: FieldOption[];
  departments: FieldOption[];
  parents: FieldOption[];
  /** Create only: manual objectives can start part-way. Later changes go through check-ins. */
  withCurrentValue?: boolean;
}): FieldDef[] {
  return [
    { type: "text", name: "title", label: "Objective", required: true, span: 2, maxLength: 160, placeholder: "e.g. Reach 2,000 paying learners" },
    { type: "textarea", name: "description", label: "Description", rows: 3, maxLength: 2000, placeholder: "What success looks like and why it matters." },
    { type: "heading", name: "_period", label: "Period & alignment" },
    { type: "select", name: "year", label: "Year", required: true, options: opts.years },
    { type: "select", name: "quarter", label: "Period", required: true, options: PERIOD_OPTIONS },
    {
      type: "select",
      name: "parentId",
      label: "Rolls up to (quarterly only)",
      options: opts.parents,
      emptyLabel: "None",
      span: 2,
      hint: "Quarterly objectives support an annual objective of the same year. Ignored for annual objectives.",
    },
    { type: "select", name: "ownerId", label: "Owner", required: true, options: opts.owners, hint: "People with access to Strategy." },
    { type: "select", name: "departmentId", label: "Department", options: opts.departments, emptyLabel: "Company-wide" },
    { type: "heading", name: "_measure", label: "Measure", description: "Live metrics update automatically from workspace data; manual objectives move with each check-in." },
    { type: "select", name: "metric", label: "Progress source", required: true, options: optionsOf(OBJECTIVE_METRIC) },
    { type: "text", name: "unit", label: "Unit", maxLength: 24, placeholder: "learners, ZAR, %, months…", hint: "Use ZAR for Rand amounts and % for percentages." },
    { type: "number", name: "startValue", label: "Start value", required: true, step: 0.01 },
    { type: "number", name: "targetValue", label: "Target value", required: true, step: 0.01 },
    ...(opts.withCurrentValue
      ? ([{ type: "number", name: "currentValue", label: "Current value", step: 0.01, hint: "Manual objectives only. Defaults to the start value." }] as FieldDef[])
      : []),
    { type: "date", name: "deadline", label: "Deadline", required: true },
    { type: "select", name: "status", label: "Status", required: true, options: optionsOf(OBJECTIVE_STATUS) },
  ];
}

/** Last calendar day of the year, or of the quarter (UTC-midnight calendar date). */
export function periodEnd(year: number, quarter: number | null): Date {
  return quarter ? calendarDate(year, quarter * 3, 0) : calendarDate(year, 12, 0);
}

export function newObjectiveDefaults(opts: { year: number; quarter?: number | null; parentId?: string; departmentId?: string | null; ownerId?: string }): FormValues {
  const quarter = opts.quarter ?? null;
  return {
    year: String(opts.year),
    quarter: quarter ? String(quarter) : "annual",
    parentId: opts.parentId ?? "",
    ownerId: opts.ownerId ?? "",
    departmentId: opts.departmentId ?? "",
    metric: "MANUAL",
    startValue: "0",
    deadline: toDateInput(periodEnd(opts.year, quarter)),
    status: "ON_TRACK",
  };
}

export function objectiveDefaults(o: {
  title: string;
  description: string | null;
  year: number;
  quarter: number | null;
  parentId: string | null;
  ownerId: string;
  departmentId: string | null;
  metric: ObjectiveMetric;
  unit: string;
  startValue: number;
  targetValue: number;
  deadline: Date;
  status: ObjectiveStatus;
}): FormValues {
  return {
    title: o.title,
    description: o.description ?? "",
    year: String(o.year),
    quarter: o.quarter ? String(o.quarter) : "annual",
    parentId: o.parentId ?? "",
    ownerId: o.ownerId,
    departmentId: o.departmentId ?? "",
    metric: o.metric,
    unit: o.unit,
    startValue: String(o.startValue),
    targetValue: String(o.targetValue),
    deadline: toDateInput(o.deadline),
    status: o.status,
  };
}

export function progressFields(o: { id: string; metric: ObjectiveMetric; unit: string; currentValue: number; isLive: boolean }): FieldDef[] {
  const value: FieldDef =
    o.metric === "MANUAL"
      ? o.unit === "ZAR"
        ? { type: "money", name: "value", label: "Current value", hint: "Leave as is to record a status change only." }
        : { type: "number", name: "value", label: `Current value${o.unit ? ` (${o.unit})` : ""}`, step: 0.01, hint: "Leave as is to record a status change only." }
      : {
          type: "heading",
          name: "_live",
          label: o.isLive ? `Live value: ${formatObjectiveValue(o.currentValue, o.unit)}` : "Live value unavailable",
          description: o.isLive
            ? `${OBJECTIVE_METRIC[o.metric].label.replace(/^Live: /, "Measured from ")}. The value at the moment you save is captured with this check-in.`
            : "The last captured value will be recorded with this check-in.",
        };
  return [
    value,
    // After the first field so a leading heading keeps its "first" styling.
    { type: "hidden", name: "id", value: o.id },
    { type: "select", name: "status", label: "Status", required: true, options: optionsOf(OBJECTIVE_STATUS) },
    { type: "textarea", name: "note", label: "Note", rows: 3, maxLength: 2000, placeholder: "What changed? Risks, blockers and next steps." },
  ];
}
