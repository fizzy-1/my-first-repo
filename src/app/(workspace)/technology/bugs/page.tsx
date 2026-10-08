import type { Metadata } from "next";
import { BugIcon, PlusIcon } from "lucide-react";
import { BugSeverity, BugStatus } from "@prisma/client";
import { deleteBugAction, reportBugAction, setBugStatusAction, updateBugAction } from "@/server/actions/technology";
import { can, canAny, requirePageAccess } from "@/server/auth/current-user";
import { usersWithPermission } from "@/server/rbac";
import { featureOptions, listBugs, type BugSort } from "@/server/services/technology";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { StatusMenu } from "@/components/common/status-menu";
import { UserChip } from "@/components/common/user-chip";
import { FormDialog } from "@/components/forms/form-dialog";
import { RowMenu } from "@/components/forms/row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BUG_SEVERITY, BUG_STATUS, optionsOf } from "@/lib/labels";
import { formatDate, formatRelative } from "@/lib/format";
import { oneOf, parseListParams } from "@/lib/list-params";
import { bugFields } from "../fields";

export const metadata: Metadata = { title: "Bugs" };

const SORTS = ["reportedAt", "severity", "number", "status"] as const satisfies readonly BugSort[];

export default async function BugsPage(props: PageProps<"/technology/bugs">) {
  const user = await requirePageAccess("technology.read", "technology.read.assigned", "technology.bugs.report");
  const sp = await props.searchParams;
  const params = parseListParams(sp, { sortable: SORTS, defaultSort: "severity", defaultDir: "desc", pageSize: 25 });
  const canTriage = can(user, "technology.write");
  const statusFilter = params.filter("status");
  const [list, developers, features] = await Promise.all([
    listBugs(user, {
      q: params.q || undefined,
      severity: oneOf<BugSeverity>(params.filter("severity"), BugSeverity),
      status: statusFilter === "OPEN_ALL" || statusFilter === undefined ? (statusFilter ? "OPEN_ALL" : params.q ? undefined : "OPEN_ALL") : oneOf<BugStatus>(statusFilter, BugStatus),
      assigneeId: params.filter("assignee"),
      sort: params.sort,
      dir: params.dir,
      skip: params.skip,
      take: params.pageSize,
    }),
    canTriage ? usersWithPermission(["technology.read.assigned", "technology.write"]) : Promise.resolve([]),
    canTriage ? featureOptions() : Promise.resolve([]),
  ]);
  const people = developers.map((d) => ({ value: d.id, label: d.name }));
  const editFields = bugFields({ people, features, canTriage, isEdit: true });

  const columns: Column<(typeof list.rows)[number]>[] = [
    { key: "number", header: "#", sortKey: "number", cell: (b) => <span className="tabular text-muted-foreground">#{b.number}</span> },
    {
      key: "title",
      header: "Bug",
      cell: (b) => (
        <div className="min-w-64">
          <p className="font-medium">{b.title}</p>
          <p className="text-xs text-muted-foreground">
            {[b.environment, b.feature?.title].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      ),
    },
    { key: "severity", header: "Severity", sortKey: "severity", cell: (b) => <StatusBadge meta={BUG_SEVERITY} value={b.severity} /> },
    {
      key: "status",
      header: "Status",
      sortKey: "status",
      cell: (b) => <StatusMenu id={b.id} value={b.status} meta={BUG_STATUS} options={Object.keys(BUG_STATUS) as BugStatus[]} action={setBugStatusAction} disabled={!b.canUpdateStatus} />,
    },
    { key: "assignee", header: "Assigned developer", hideOnMobile: true, cell: (b) => <UserChip name={b.assignee?.name} /> },
    { key: "reporter", header: "Reporter", hideOnMobile: true, cell: (b) => <span className="text-muted-foreground">{b.reporter.name}</span> },
    { key: "reported", header: "Reported", sortKey: "reportedAt", hideOnMobile: true, cell: (b) => <span className="text-xs whitespace-nowrap text-muted-foreground" title={formatDate(b.reportedAt)}>{formatRelative(b.reportedAt)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (b) =>
        b.canEdit && (
          <RowMenu
            label={`bug #${b.number}`}
            edit={{
              title: `Edit bug #${b.number}`,
              action: updateBugAction,
              fields: [{ type: "hidden", name: "id", value: b.id }, ...editFields],
              defaults: { title: b.title, description: b.description ?? "", severity: b.severity, environment: b.environment ?? "", assigneeId: b.assigneeId ?? "", featureId: b.featureId ?? "", status: b.status },
            }}
            remove={{ action: deleteBugAction, input: { id: b.id }, title: `Delete bug #${b.number}?`, description: "Prefer closing bugs; deletion removes the record permanently." }}
          />
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Bugs"
        description={canAny(user, ["technology.read"]) ? "Every reported issue across the learner platform." : canAny(user, ["technology.read.assigned"]) ? "Bugs assigned to or reported by you." : "Bugs you have reported."}
        actions={
          can(user, "technology.bugs.report") && (
            <FormDialog
              title="Report a bug"
              description="Critical and high bugs alert the product team immediately."
              trigger={
                <Button>
                  <PlusIcon /> Report bug
                </Button>
              }
              openParam="bug"
              action={reportBugAction}
              fields={bugFields({ people, features, canTriage, isEdit: false })}
              defaultValues={{ severity: "MEDIUM" }}
              submitLabel="Report bug"
            />
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(BUG_SEVERITY) as BugSeverity[]).map((s) => (
          <Badge key={s} tone={BUG_SEVERITY[s].tone} className="px-2.5 py-1 text-[13px]">
            {list.openBySeverity[s] ?? 0} open {BUG_SEVERITY[s].label.toLowerCase()}
          </Badge>
        ))}
      </div>
      <Card className="overflow-hidden">
        <TableToolbar
          searchPlaceholder="Search bugs or #number…"
          filters={[
            { param: "status", label: "Status", options: [{ value: "OPEN_ALL", label: "Open & in progress" }, ...optionsOf(BUG_STATUS)] },
            { param: "severity", label: "Severity", options: optionsOf(BUG_SEVERITY) },
            ...(canTriage ? [{ param: "assignee", label: "Developer", options: people }] : []),
          ]}
        />
        <DataTable
          columns={columns}
          rows={list.rows}
          total={list.total}
          params={params}
          pathname="/technology/bugs"
          searchParams={sp}
          rowClassName={(b) => (b.severity === "CRITICAL" && (b.status === "OPEN" || b.status === "IN_PROGRESS") ? "bg-danger-soft/30" : undefined)}
          empty={<EmptyState icon={BugIcon} title="No bugs found" description="Nothing matches these filters." />}
        />
      </Card>
    </>
  );
}
