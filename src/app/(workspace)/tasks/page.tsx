import type { Metadata } from "next";
import Link from "next/link";
import { ListTodoIcon, PlusIcon, FolderKanbanIcon } from "lucide-react";
import { Priority, TaskStatus } from "@prisma/client";
import { setTaskStatusAction, createTaskAction } from "@/server/actions/tasks";
import { can, requireUser } from "@/server/auth/current-user";
import { activeUserOptions, departmentOptions } from "@/server/rbac";
import { listTasks, projectOptions, type TaskScope, type TaskSort } from "@/server/services/tasks";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { DueDate } from "@/components/common/due-date";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { StatusMenu } from "@/components/common/status-menu";
import { UserChip } from "@/components/common/user-chip";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { optionsOf, PRIORITY, TASK_STATUS } from "@/lib/labels";
import { buildHref, oneOf, parseListParams } from "@/lib/list-params";
import { TaskRowActions } from "./task-row-actions";
import { taskDefaults, taskFields } from "./task-fields";

export const metadata: Metadata = { title: "Tasks" };

const SORTS = ["dueDate", "priority", "createdAt", "number", "status"] as const satisfies readonly TaskSort[];

export default async function TasksPage(props: PageProps<"/tasks">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const params = parseListParams(sp, { sortable: SORTS, defaultSort: "dueDate", defaultDir: "asc", pageSize: 25 });

  const scopes: { key: TaskScope; label: string; visible: boolean }[] = [
    { key: "mine", label: "Assigned to me", visible: true },
    { key: "created", label: "Created by me", visible: true },
    { key: "department", label: user.departmentName ? `${user.departmentName} team` : "My department", visible: can(user, "tasks.read.department") && !!user.departmentId },
    { key: "all", label: can(user, "tasks.read.all") ? "All tasks" : "All visible", visible: true },
  ];
  const scope = oneOf<TaskScope>(params.filter("scope"), ["mine", "created", "department", "all"]) ?? "mine";
  const statusFilter = params.filter("status");
  const status = statusFilter === "OPEN" ? "OPEN" : oneOf<TaskStatus>(statusFilter, TaskStatus);
  const canAssign = can(user, "tasks.assign");

  const [{ total, rows, statusCounts }, users, departments, projects] = await Promise.all([
    listTasks(user, {
      scope,
      q: params.q || undefined,
      status: status ?? (params.filter("status") === undefined && scope === "mine" ? "OPEN" : undefined),
      priority: oneOf<Priority>(params.filter("priority"), Priority),
      assigneeId: params.filter("assignee"),
      projectId: params.filter("project"),
      overdue: params.filter("overdue") === "1",
      sort: params.sort,
      dir: params.dir,
      skip: params.skip,
      take: params.pageSize,
    }),
    activeUserOptions(),
    departmentOptions(),
    projectOptions(),
  ]);

  const fields = taskFields({ users, departments, projects, canAssign });
  const now = new Date();

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "title",
      header: "Task",
      sortKey: "number",
      cell: (t) => (
        <div className="min-w-56">
          <Link href={`/tasks/${t.id}`} className="font-medium hover:text-primary-soft-foreground hover:underline">
            {t.title}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="tabular">#{t.number}</span>
            {t.project && <span>· {t.project.name}</span>}
            {t.meeting && <span>· Action item from {t.meeting.title}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortKey: "status",
      cell: (t) => (
        <StatusMenu
          id={t.id}
          value={t.status}
          meta={TASK_STATUS}
          options={Object.keys(TASK_STATUS) as TaskStatus[]}
          action={setTaskStatusAction}
          disabled={!t.canUpdateStatus}
        />
      ),
    },
    { key: "priority", header: "Priority", sortKey: "priority", cell: (t) => <StatusBadge meta={PRIORITY} value={t.priority} dot={false} /> },
    { key: "assignee", header: "Assignee", hideOnMobile: true, cell: (t) => <UserChip name={t.assignee?.name} /> },
    { key: "department", header: "Department", hideOnMobile: true, cell: (t) => <span className="text-muted-foreground">{t.department?.name ?? "—"}</span> },
    { key: "due", header: "Due", sortKey: "dueDate", cell: (t) => <DueDate date={t.dueDate} done={t.status === "COMPLETED"} now={now} /> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (t) => (
        <TaskRowActions
          task={{ id: t.id, number: t.number, title: t.title }}
          canManage={t.canManage}
          canDelete={t.creatorId === user.id || can(user, "tasks.read.all")}
          fields={fields}
          defaults={taskDefaults(t)}
        />
      ),
    },
  ];

  const tabHref = (key: TaskScope) => buildHref("/tasks", {}, { scope: key === "mine" ? undefined : key });
  const openCount = (statusCounts.TODO ?? 0) + (statusCounts.IN_PROGRESS ?? 0) + (statusCounts.BLOCKED ?? 0);

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Every piece of work across the company — including meeting action items and development tasks."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/tasks/projects">
                <FolderKanbanIcon /> Projects
              </Link>
            </Button>
            <FormDialog
              title="New task"
              description={canAssign ? "Create a task and assign it to a team member." : "Create a task for yourself."}
              trigger={
                <Button>
                  <PlusIcon /> New task
                </Button>
              }
              openParam="task"
              action={createTaskAction}
              fields={fields}
              defaultValues={taskDefaults()}
              submitLabel="Create task"
            />
          </>
        }
      />

      <LinkTabs
        className="mb-4"
        tabs={scopes.filter((s) => s.visible).map((s) => ({ label: s.label, href: tabHref(s.key), active: scope === s.key }))}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Open", openCount, "OPEN"],
            ["In progress", statusCounts.IN_PROGRESS ?? 0, "IN_PROGRESS"],
            ["Blocked", statusCounts.BLOCKED ?? 0, "BLOCKED"],
            ["Completed", statusCounts.COMPLETED ?? 0, "COMPLETED"],
          ] as const
        ).map(([label, count, value]) => (
          <Link
            key={value}
            href={buildHref("/tasks", sp, { status: value, page: undefined })}
            className="rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="tabular mt-1 text-xl font-semibold">{count}</p>
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        <TableToolbar
          searchPlaceholder="Search tasks or #number…"
          filters={[
            { param: "status", label: "Status", options: [{ value: "OPEN", label: "Open (not completed)" }, ...optionsOf(TASK_STATUS)] },
            { param: "priority", label: "Priority", options: optionsOf(PRIORITY) },
            ...(scope !== "mine" ? [{ param: "assignee", label: "Assignee", options: users }] : []),
            ...(projects.length ? [{ param: "project", label: "Project", options: projects }] : []),
          ]}
        >
          <Button asChild variant={params.filter("overdue") === "1" ? "default" : "outline"} size="sm">
            <Link href={buildHref("/tasks", sp, { overdue: params.filter("overdue") === "1" ? undefined : "1", page: undefined })}>
              Overdue only
            </Link>
          </Button>
        </TableToolbar>
        <DataTable
          columns={columns}
          rows={rows}
          total={total}
          params={params}
          pathname="/tasks"
          searchParams={sp}
          rowClassName={(t) => (t.status === "COMPLETED" ? "opacity-70" : undefined)}
          empty={
            <EmptyState
              icon={ListTodoIcon}
              title={params.q || statusFilter ? "No tasks match your filters" : "No tasks here yet"}
              description={params.q || statusFilter ? "Try clearing the search or filters." : "Create a task to start tracking work."}
            />
          }
        />
      </Card>
    </>
  );
}
