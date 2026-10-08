import type { FieldDef, FieldOption, FormValues } from "@/components/forms/types";
import { toDateInput } from "@/lib/dates";
import { CONTENT_STAGE, CONTENT_TYPE, optionsOf, PRIORITY } from "@/lib/labels";

export function contentFields(opts: { courses: FieldOption[]; topics: FieldOption[]; people: FieldOption[] }): FieldDef[] {
  return [
    { type: "text", name: "title", label: "Title", required: true, span: 2, placeholder: "e.g. Differential Calculus: Worked examples" },
    { type: "select", name: "type", label: "Type", required: true, options: optionsOf(CONTENT_TYPE) },
    { type: "select", name: "stage", label: "Stage", required: true, options: optionsOf(CONTENT_STAGE) },
    { type: "select", name: "courseId", label: "Course", options: opts.courses, emptyLabel: "—" },
    { type: "select", name: "topicId", label: "Topic", options: opts.topics, emptyLabel: "—" },
    { type: "select", name: "assigneeId", label: "Tutor", options: opts.people, emptyLabel: "Unassigned" },
    { type: "select", name: "reviewerId", label: "Reviewer", options: opts.people, emptyLabel: "Me" },
    { type: "date", name: "dueDate", label: "Deadline" },
    { type: "select", name: "priority", label: "Priority", required: true, options: optionsOf(PRIORITY) },
    { type: "number", name: "estimatedHours", label: "Estimated hours", min: 0, step: 0.5 },
    { type: "textarea", name: "notes", label: "Notes", rows: 2 },
  ];
}

export function contentDefaults(c?: {
  title: string;
  type: string;
  stage: string;
  priority: string;
  courseId: string | null;
  topicId: string | null;
  assigneeId: string | null;
  reviewerId?: string | null;
  dueDate: Date | null;
  estimatedHours: number | null;
  notes: string | null;
}): FormValues {
  if (!c) return { type: "VIDEO", stage: "PLANNED", priority: "MEDIUM" };
  return {
    title: c.title,
    type: c.type,
    stage: c.stage,
    priority: c.priority,
    courseId: c.courseId ?? "",
    topicId: c.topicId ?? "",
    assigneeId: c.assigneeId ?? "",
    reviewerId: c.reviewerId ?? "",
    dueDate: toDateInput(c.dueDate),
    estimatedHours: c.estimatedHours?.toString() ?? "",
    notes: c.notes ?? "",
  };
}
