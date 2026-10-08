import type { Metadata } from "next";
import Link from "next/link";
import { ListTodoIcon, PlusIcon } from "lucide-react";
import { Priority, TaskStatus } from "@prisma/client";
import { createTaskAction, setTaskStatusAction } from "@/server/actions/tasks";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { usersWithPermission } from "@/server/rbac";
import { developmentTasksWhere, featureOptions, openBugOptions, technologyDepartmentId } from "@/server/services/technology";
import { listTasks, type TaskSort } from "@/server/services/tasks";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { DueDate } from "@/components/common/due-date";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { StatusMenu } from "@/components/common/status-menu";
import { UserChip } from "@/components/common/user-chip";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { optionsOf, PRIORITY, TASK_STATUS } from "@/lib/labels";
import { oneOf, parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Development tasks" };

const SORTS = ["dueDate", "priority", "createdAt", "number", "status"] as const satisfies readonly TaskSort[];

export default async function DevTasksPage(props: PageProps<"/technology/tasks">) {
  const user = await requirePageAccess("technology.read", "technology.read.assigned");
  const sp = await props.searchParams;
  const params = parseListParams(sp, { sortable: SORTS, defaultSort: "priority", defaultDir: "desc", pageSize: 25 });
  const statusFilter = params.filter("status");
  const [where, developers, features, bugs, techDept] = await Promise.all([
    developmentTasksWhere(user),
    usersWithPermission(["technology.read.assigned", "technology.write"]),
    featureOptions(),
    openBugOptions(user),
    technologyDepartmentId(),
  ]);
  const { total, rows } = await listTasks(user, {
    scope: "all",
    where,
    q: params.q || undefined,
    status: statusFilter === "OPEN" || statusFilter === undefined ? "OPEN" : oneOf<TaskStatus>(statusFilter, TaskStatus),
    priority: oneOf<Priority>(params.filter("priority"), Priority),
    assigneeId: params.filter("developer"),
    sort: params.sort,
    dir: params.dir,
    skip: params.skip,
    take: params.pageSize,
  });
  const people = developers.map((d) => ({ value: d.id, label: d.name }));

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "task",
      header: "Task",
      sortKey: "number",
      cell: (t) => (
        <div className="min-w-64">
          <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
            {t.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            #{t.number}
            {t.feature && ` · ${t.feature.title}`}
            {t.bug && ` · Bug #${t.bug.number}`}
          </p>
        </div>
      ),
    },
    { key: "developer", header: "Developer", cell: (t) => <UserChip name={t.assignee?.name} /> },
    { key: "priority", header: "Priority", sortKey: "priority", cell: (t) => <StatusBadge meta={PRIORITY} value={t.priority} dot={false} /> },
    { key: "status", header: "Status", sortKey: "status", cell: (t) => <StatusMenu id={t.id} value={t.status} meta={TASK_STATUS} options={Object.keys(TASK_STATUS) as TaskStatus[]} action={setTaskStatusAction} disabled={!t.canUpdateStatus} /> },
    { key: "due", header: "Deadline", sortKey: "dueDate", cell: (t) => <DueDate date={t.dueDate} done={t.status === "COMPLETED"} /> },
  ];

  return (
    <>
      <PageHeader
        title="Development tasks"
        description="Engineering work linked to roadmap features and bugs. These are regular tasks, so they also appear in each developer's task list."
        actions={
          can(user, "tasks.assign") && (
            <FormDialog
              title="New development task"
              trigger={
                <Button>
                  <PlusIcon /> New task
                </Button>
              }
              action={createTaskAction}
              fields={[
                ...(techDept ? [{ type: "hidden" as const, name: "departmentId", value: techDept }] : []),
                { type: "text", name: "title", label: "Task", required: true, span: 2 },
                { type: "textarea", name: "description", label: "Description", rows: 3 },
                { type: "select", name: "assigneeId", label: "Developer", options: people, emptyLabel: "Me" },
                { type: "date", name: "dueDate", label: "Deadline" },
                { type: "select", name: "priority", label: "Priority", required: true, options: optionsOf(PRIORITY) },
                { type: "select", name: "status", label: "Status", required: true, options: optionsOf(TASK_STATUS) },
                { type: "select", name: "featureId", label: "Roadmap feature", options: features, emptyLabel: "None" },
                { type: "select", name: "bugId", label: "Bug", options: bugs, emptyLabel: "None" },
              ]}
              defaultValues={{ priority: "MEDIUM", status: "TODO" }}
              submitLabel="Create task"
            />
          )
        }
      />
      <Card className="overflow-hidden">
        <TableToolbar
          searchPlaceholder="Search tasks…"
          filters={[
            { param: "status", label: "Status", options: [{ value: "OPEN", label: "Open (not completed)" }, ...optionsOf(TASK_STATUS)] },
            { param: "priority", label: "Priority", options: optionsOf(PRIORITY) },
            { param: "developer", label: "Developer", options: people },
          ]}
        />
        <DataTable
          columns={columns}
          rows={rows}
          total={total}
          params={params}
          pathname="/technology/tasks"
          searchParams={sp}
          empty={<EmptyState icon={ListTodoIcon} title="No development tasks" />}
        />
      </Card>
    </>
  );
}
