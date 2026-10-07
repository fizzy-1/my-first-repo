import type { FieldDef, FieldOption, FormValues } from "@/components/forms/types";
import { optionsOf, PRIORITY, TASK_STATUS } from "@/lib/labels";
import { toDateInput } from "@/lib/dates";

export function taskFields(opts: {
  users: FieldOption[];
  departments: FieldOption[];
  projects: FieldOption[];
  canAssign: boolean;
}): FieldDef[] {
  return [
    { type: "text", name: "title", label: "Title", required: true, span: 2, maxLength: 200, placeholder: "e.g. Finalise Q4 school proposal deck" },
    { type: "textarea", name: "description", label: "Description", rows: 4, placeholder: "Context, acceptance criteria, links…" },
    ...(opts.canAssign
      ? ([{ type: "select", name: "assigneeId", label: "Assignee", options: opts.users, emptyLabel: "Me", hint: "Leave as “Me” to assign to yourself." }] as FieldDef[])
      : []),
    { type: "date", name: "dueDate", label: "Due date" },
    { type: "select", name: "priority", label: "Priority", required: true, options: optionsOf(PRIORITY) },
    { type: "select", name: "status", label: "Status", required: true, options: optionsOf(TASK_STATUS) },
    { type: "select", name: "departmentId", label: "Department", options: opts.departments, emptyLabel: "Assignee's department" },
    { type: "select", name: "projectId", label: "Related project", options: opts.projects, emptyLabel: "None" },
  ];
}

export function taskDefaults(task?: {
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  assigneeId: string | null;
  departmentId: string | null;
  projectId: string | null;
}): FormValues {
  if (!task) return { status: "TODO", priority: "MEDIUM" };
  return {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    dueDate: toDateInput(task.dueDate),
    assigneeId: task.assigneeId ?? "",
    departmentId: task.departmentId ?? "",
    projectId: task.projectId ?? "",
  };
}
