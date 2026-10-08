import type { Metadata } from "next";
import { CpuIcon, PlusIcon } from "lucide-react";
import { deleteFeatureAction, moveFeatureAction, saveFeatureAction } from "@/server/actions/technology";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { activeUserOptions } from "@/server/rbac";
import { listFeatures } from "@/server/services/technology";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { UserChip } from "@/components/common/user-chip";
import { FormDialog } from "@/components/forms/form-dialog";
import { RowMenu } from "@/components/forms/row-menu";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FEATURE_PIPELINE, FEATURE_STATUS, PRIORITY } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { first } from "@/lib/list-params";
import { LinkTabs } from "@/components/common/link-tabs";
import { DueDate } from "@/components/common/due-date";
import { featureDefaults, featureFields } from "./fields";

export const metadata: Metadata = { title: "Product roadmap" };

export default async function RoadmapPage(props: PageProps<"/technology">) {
  const user = await requirePageAccess("technology.read", "technology.read.assigned");
  const sp = await props.searchParams;
  const view = first(sp.view) === "list" ? "list" : "board";
  const canWrite = can(user, "technology.write");
  const [features, users] = await Promise.all([listFeatures(user), activeUserOptions()]);
  const people = users.map(({ value, label }) => ({ value, label }));
  const fields = featureFields(people);
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Product roadmap"
        description="What we're building for the learner platform, from backlog to release."
        actions={
          canWrite && (
            <FormDialog
              title="Add feature"
              trigger={
                <Button>
                  <PlusIcon /> Add feature
                </Button>
              }
              action={saveFeatureAction}
              fields={fields}
              defaultValues={featureDefaults()}
              submitLabel="Add to roadmap"
            />
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {FEATURE_PIPELINE.map((s) => (
          <Card key={s} className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{FEATURE_STATUS[s].label}</p>
            <p className="tabular mt-1 text-lg font-semibold">{features.filter((f) => f.status === s).length}</p>
          </Card>
        ))}
      </div>
      <LinkTabs
        className="mb-4"
        tabs={[
          { label: "Board", href: "/technology", active: view === "board" },
          { label: "List", href: "/technology?view=list", active: view === "list" },
        ]}
      />
      {features.length === 0 ? (
        <Card>
          <EmptyState icon={CpuIcon} title="The roadmap is empty" />
        </Card>
      ) : view === "board" ? (
        <KanbanBoard
          canMove={canWrite}
          moveAction={moveFeatureAction}
          columns={FEATURE_PIPELINE.map((s) => ({ id: s, label: FEATURE_STATUS[s].label }))}
          cards={features.map((f) => ({
            id: f.id,
            columnId: f.status,
            title: f.title,
            lines: f.description ? [f.description] : [],
            badges: [{ label: PRIORITY[f.priority].label, tone: PRIORITY[f.priority].tone }, ...(f.openBugs ? [{ label: `${f.openBugs} open bug${f.openBugs === 1 ? "" : "s"}`, tone: "danger" as const }] : [])],
            urgent: f.status !== "RELEASED" && f.targetDate && f.targetDate < now ? "Past deadline" : undefined,
            footerLeft: f.owner?.name ?? "Unowned",
            footerRight: f.status === "RELEASED" ? (f.releasedAt ? `Released ${formatDate(f.releasedAt)}` : "") : f.targetDate ? formatDate(f.targetDate) : "",
          }))}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Feature</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Owner</TableHead>
                <TableHead className="hidden md:table-cell">Tasks</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {features.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <p className="min-w-56 font-medium">{f.title}</p>
                    {f.description && <p className="line-clamp-1 max-w-md text-xs text-muted-foreground">{f.description}</p>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge meta={PRIORITY} value={f.priority} dot={false} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge meta={FEATURE_STATUS} value={f.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <UserChip name={f.owner?.name} />
                  </TableCell>
                  <TableCell className="tabular hidden text-muted-foreground md:table-cell">
                    {f.tasksDone}/{f.taskCount}
                  </TableCell>
                  <TableCell>{f.status === "RELEASED" ? <span className="text-muted-foreground">{formatDate(f.releasedAt)}</span> : <DueDate date={f.targetDate} now={now} />}</TableCell>
                  <TableCell className="text-right">
                    {canWrite && (
                      <RowMenu
                        label={f.title}
                        edit={{ title: "Edit feature", action: saveFeatureAction, fields: [{ type: "hidden", name: "id", value: f.id }, ...fields], defaults: featureDefaults(f) }}
                        remove={{ action: deleteFeatureAction, input: { id: f.id }, title: "Remove this feature?", description: `“${f.title}” will be removed from the roadmap. Linked bugs and tasks are kept.` }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
