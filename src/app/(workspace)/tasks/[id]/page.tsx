import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClockIcon, CheckIcon, FileTextIcon, PencilIcon, Trash2Icon } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { deleteTaskAction, setTaskStatusAction, updateTaskAction } from "@/server/actions/tasks";
import { can, requireUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors";
import { activeUserOptions, departmentOptions } from "@/server/rbac";
import { getTask, projectOptions } from "@/server/services/tasks";
import { DueDate } from "@/components/common/due-date";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { UserChip } from "@/components/common/user-chip";
import { ActionButton, ConfirmActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { DOCUMENT_CATEGORY, PRIORITY, TASK_STATUS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { taskDefaults, taskFields } from "../task-fields";

export const metadata: Metadata = { title: "Task" };

async function loadTask(id: string) {
  const user = await requireUser();
  try {
    return { user, task: await getTask(user, id) };
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export default async function TaskDetailPage(props: PageProps<"/tasks/[id]">) {
  const { id } = await props.params;
  const { user, task } = await loadTask(id);
  const [users, departments, projects] = await Promise.all([activeUserOptions(), departmentOptions(), projectOptions()]);
  const fields = taskFields({ users, departments, projects, canAssign: can(user, "tasks.assign") });
  const canDelete = task.creatorId === user.id || can(user, "tasks.read.all");

  const nextStatuses: TaskStatus[] = (["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as TaskStatus[]).filter((s) => s !== task.status);

  const meta: { label: string; value: React.ReactNode }[] = [
    { label: "Assignee", value: <UserChip name={task.assignee?.name} subtitle={task.assignee?.jobTitle} /> },
    { label: "Created by", value: <UserChip name={task.creator.name} /> },
    { label: "Due", value: <DueDate date={task.dueDate} done={task.status === "COMPLETED"} /> },
    { label: "Department", value: task.department?.name ?? "—" },
    { label: "Project", value: task.project?.name ?? "—" },
    {
      label: "Related meeting",
      value: task.meeting ? (
        <Link href={`/meetings/${task.meeting.id}`} className="text-primary-soft-foreground hover:underline">
          {task.meeting.title}
        </Link>
      ) : (
        "—"
      ),
    },
    ...(task.feature ? [{ label: "Roadmap feature", value: <Link className="text-primary-soft-foreground hover:underline" href="/technology">{task.feature.title}</Link> }] : []),
    ...(task.bug ? [{ label: "Bug", value: <Link className="text-primary-soft-foreground hover:underline" href={`/technology/bugs?q=${task.bug.number}`}>#{task.bug.number} {task.bug.title}</Link> }] : []),
    ...(task.school ? [{ label: "School", value: <Link className="text-primary-soft-foreground hover:underline" href={`/schools/${task.school.id}`}>{task.school.name}</Link> }] : []),
    { label: "Created", value: formatDateTime(task.createdAt) },
    { label: "Completed", value: task.completedAt ? formatDateTime(task.completedAt) : "—" },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Tasks", href: "/tasks" }, { label: `#${task.number}` }]}
        title={task.title}
        meta={
          <>
            <StatusBadge meta={TASK_STATUS} value={task.status} />
            <StatusBadge meta={PRIORITY} value={task.priority} dot={false} />
          </>
        }
        actions={
          <>
            {task.canManage && (
              <FormDialog
                title={`Edit task #${task.number}`}
                trigger={
                  <Button variant="outline">
                    <PencilIcon /> Edit
                  </Button>
                }
                action={updateTaskAction}
                fields={[{ type: "hidden", name: "id", value: task.id }, ...fields]}
                defaultValues={taskDefaults(task)}
                submitLabel="Save changes"
              />
            )}
            {canDelete && (
              <ConfirmActionButton
                variant="outline"
                action={deleteTaskAction}
                input={{ id: task.id }}
                title={`Delete task #${task.number}?`}
                description="This permanently deletes the task. The deletion is recorded in the audit log."
                confirmLabel="Delete task"
              >
                <Trash2Icon /> Delete
              </ConfirmActionButton>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <SectionCard title="Description">
            {task.description ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No description provided.</p>
            )}
          </SectionCard>
          <SectionCard title="Attachments" description="Documents linked from the company repository.">
            {task.attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents attached.</p>
            ) : (
              <ul className="divide-y divide-border">
                {task.attachments.map(({ document }) => (
                  <li key={document.id} className="flex items-center gap-3 py-2.5">
                    <FileTextIcon className="size-4 text-muted-foreground" />
                    <Link href={`/documents/${document.id}`} className="flex-1 truncate text-sm hover:underline">
                      {document.title}
                    </Link>
                    <StatusBadge meta={DOCUMENT_CATEGORY} value={document.category} dot={false} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          {task.canUpdateStatus && (
            <SectionCard title="Update status">
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((status) => (
                  <ActionButton
                    key={status}
                    action={setTaskStatusAction}
                    input={{ id: task.id, status }}
                    variant={status === "COMPLETED" ? "default" : "outline"}
                    size="sm"
                  >
                    {status === "COMPLETED" ? <CheckIcon /> : <CalendarClockIcon />}
                    {TASK_STATUS[status].label}
                  </ActionButton>
                ))}
              </div>
            </SectionCard>
          )}
          <SectionCard title="Details">
            <dl className="space-y-3 text-sm">
              {meta.map((m) => (
                <div key={m.label} className="flex items-start justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">{m.label}</dt>
                  <dd className="min-w-0 text-right">{m.value}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
