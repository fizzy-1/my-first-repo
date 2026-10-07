import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanbanIcon, PlusIcon } from "lucide-react";
import { createProjectAction } from "@/server/actions/tasks";
import { can, requireUser } from "@/server/auth/current-user";
import { activeUserOptions, departmentOptions } from "@/server/rbac";
import { listProjects } from "@/server/services/tasks";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { optionsOf, PROJECT_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const [projects, users, departments] = await Promise.all([listProjects(user), activeUserOptions(), departmentOptions()]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Tasks", href: "/tasks" }, { label: "Projects" }]}
        title="Projects"
        description="Group related tasks into projects to track delivery across teams."
        actions={
          can(user, "tasks.assign") && (
            <FormDialog
              title="New project"
              trigger={
                <Button>
                  <PlusIcon /> New project
                </Button>
              }
              action={createProjectAction}
              defaultValues={{ status: "ACTIVE" }}
              fields={[
                { type: "text", name: "name", label: "Name", required: true, span: 2 },
                { type: "textarea", name: "description", label: "Description", rows: 3 },
                { type: "select", name: "status", label: "Status", required: true, options: optionsOf(PROJECT_STATUS) },
                { type: "select", name: "ownerId", label: "Owner", options: users, emptyLabel: "Me" },
                { type: "select", name: "departmentId", label: "Department", options: departments, emptyLabel: "My department" },
                { type: "date", name: "startDate", label: "Start date" },
                { type: "date", name: "dueDate", label: "Target date" },
              ]}
              submitLabel="Create project"
            />
          )
        }
      />
      {projects.length === 0 ? (
        <Card>
          <EmptyState icon={FolderKanbanIcon} title="No projects yet" description="Create a project to group related tasks." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const pct = p.taskCount ? Math.round((p.completed / p.taskCount) * 100) : 0;
            return (
              <Link key={p.id} href={`/tasks?scope=all&project=${p.id}`} className="block">
                <Card className="h-full p-5 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{p.name}</h3>
                    <StatusBadge meta={PROJECT_STATUS} value={p.status} />
                  </div>
                  {p.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="tabular">
                      {p.completed}/{p.taskCount} tasks done
                    </span>
                    <span className="tabular">{pct}%</span>
                  </div>
                  <Progress value={pct} className="mt-1.5" label={`${p.name} progress`} tone={pct === 100 ? "success" : "primary"} />
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Owner: {p.owner?.name ?? "—"}</span>
                    {p.department && <span>{p.department.name}</span>}
                    {p.dueDate && <span>Due {formatDate(p.dueDate)}</span>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
