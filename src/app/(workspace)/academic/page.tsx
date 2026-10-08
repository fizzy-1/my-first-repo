import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCapIcon, PlusIcon } from "lucide-react";
import { ContentStage, ContentType } from "@prisma/client";
import { createContentAction, deleteContentAction, moveContentStageAction, updateContentAction } from "@/server/actions/academic";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { activeUserOptions } from "@/server/rbac";
import { academicOverview, contentBoard, courseAndTopicOptions, listContent } from "@/server/services/academic";
import { ChartCard } from "@/components/charts/chart-card";
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
import { RowMenu } from "@/components/forms/row-menu";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CONTENT_PIPELINE, CONTENT_STAGE, CONTENT_TYPE, optionsOf, PRIORITY } from "@/lib/labels";
import { formatDate, formatDelta, formatHours, formatNumber } from "@/lib/format";
import { buildHref, oneOf, parseListParams } from "@/lib/list-params";
import { contentDefaults, contentFields } from "./fields";

export const metadata: Metadata = { title: "Academic" };

const SORTS = ["dueDate", "title", "stage", "updatedAt"] as const;

export default async function AcademicPage(props: PageProps<"/academic">) {
  const user = await requirePageAccess("academic.read", "academic.read.assigned");
  const sp = await props.searchParams;
  const params = parseListParams(sp, { sortable: SORTS, defaultSort: "dueDate", defaultDir: "asc", pageSize: 30 });
  const view = params.filter("view") === "list" ? "list" : "board";
  const canWrite = can(user, "academic.write");
  const filters = {
    q: params.q || undefined,
    stage: oneOf<ContentStage>(params.filter("stage"), ContentStage),
    type: oneOf<ContentType>(params.filter("type"), ContentType),
    courseId: params.filter("course"),
    assigneeId: params.filter("assignee"),
    overdue: params.filter("overdue") === "1",
  };
  const [overview, options, users] = await Promise.all([academicOverview(user), courseAndTopicOptions(), activeUserOptions()]);
  const people = users.map(({ value, label }) => ({ value, label }));
  const fields = contentFields({ ...options, people });
  const now = new Date();

  const kpis: [string, string, string?][] = [
    ["Published this month", formatNumber(overview.publishedThisMonth)],
    ["In production", formatNumber(overview.inProduction), "Recording + editing"],
    ["Awaiting review", formatNumber(overview.inReview)],
    ["Overdue content", formatNumber(overview.overdue)],
    ["Tutor hours this month", formatHours(overview.hoursThisMonth)],
    ...(overview.weeklyActive !== null
      ? ([["Weekly active learners", formatNumber(overview.weeklyActive), overview.weeklyActiveGrowth !== null ? `${formatDelta(overview.weeklyActiveGrowth)} week on week` : undefined]] as [string, string, string?][])
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Academic operations"
        description={can(user, "academic.read") ? "Content production, curriculum coverage, tutors and learner engagement." : "Content assigned to you."}
        actions={
          canWrite && (
            <FormDialog
              title="New content item"
              size="lg"
              trigger={
                <Button>
                  <PlusIcon /> New content
                </Button>
              }
              action={createContentAction}
              fields={fields}
              defaultValues={contentDefaults()}
              submitLabel="Add to pipeline"
            />
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map(([label, value, sub]) => (
          <Card key={label} className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="tabular mt-1 text-lg font-semibold">{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
          </Card>
        ))}
      </div>

      {overview.engagement.length > 0 && (
        <div className="mb-6 grid gap-6 xl:grid-cols-2">
          <ChartCard
            title="Learner engagement"
            description="Weekly active learners across all courses (from the learner platform)"
            data={overview.engagement}
            series={[{ key: "activeLearners", label: "Active learners", slot: 1, type: "area" }]}
          />
          <ChartCard
            title="Lessons completed per week"
            description={`Average quiz score last week: ${overview.avgQuizScore ?? "—"}%`}
            data={overview.engagement}
            series={[{ key: "lessonsCompleted", label: "Lessons completed", slot: 2, type: "bar" }]}
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <LinkTabs
          tabs={[
            { label: "Pipeline board", href: buildHref("/academic", sp, { view: undefined, page: undefined }), active: view === "board" },
            { label: "List", href: buildHref("/academic", sp, { view: "list" }), active: view === "list" },
          ]}
        />
        <Button asChild size="sm" variant={filters.overdue ? "default" : "outline"}>
          <Link href={buildHref("/academic", sp, { overdue: filters.overdue ? undefined : "1", page: undefined })}>Overdue only</Link>
        </Button>
      </div>

      <Card className="mb-4 overflow-visible">
        <TableToolbar
          searchPlaceholder="Search content…"
          filters={[
            { param: "course", label: "Course", options: options.courses },
            { param: "type", label: "Type", options: optionsOf(CONTENT_TYPE) },
            ...(can(user, "academic.read") ? [{ param: "assignee", label: "Tutor", options: people }] : []),
            ...(view === "list" ? [{ param: "stage", label: "Stage", options: optionsOf(CONTENT_STAGE) }] : []),
          ]}
        />
      </Card>

      {view === "board" ? (
        <BoardView user={user} filters={filters} canWrite={canWrite} now={now} />
      ) : (
        <ListView user={user} filters={filters} params={params} sp={sp} fields={fields} canWrite={canWrite} now={now} />
      )}
    </>
  );
}

async function BoardView({ user, filters, canWrite, now }: { user: Awaited<ReturnType<typeof requirePageAccess>>; filters: Parameters<typeof contentBoard>[1]; canWrite: boolean; now: Date }) {
  const items = await contentBoard(user, filters);
  const canMoveAny = canWrite || items.some((i) => i.assigneeId === user.id);
  return (
    <KanbanBoard
      canMove={canMoveAny}
      moveAction={moveContentStageAction}
      columns={CONTENT_PIPELINE.map((stage) => ({ id: stage, label: CONTENT_STAGE[stage].label }))}
      emptyText="No content"
      cards={items.map((i) => ({
        id: i.id,
        columnId: i.stage,
        title: i.title,
        lines: [[i.course?.title, i.topic?.title].filter(Boolean).join(" · ")].filter(Boolean),
        badges: [{ label: CONTENT_TYPE[i.type].label, tone: CONTENT_TYPE[i.type].tone }, ...(i.priority === "HIGH" || i.priority === "CRITICAL" ? [{ label: PRIORITY[i.priority].label, tone: PRIORITY[i.priority].tone }] : [])],
        urgent: i.stage !== "PUBLISHED" && i.dueDate && i.dueDate < now ? `Due ${formatDate(i.dueDate)}` : undefined,
        footerLeft: i.assignee?.name ?? "Unassigned",
        footerRight: i.stage === "PUBLISHED" ? (i.publishedAt ? formatDate(i.publishedAt) : "") : i.dueDate ? formatDate(i.dueDate) : "",
      }))}
    />
  );
}

async function ListView({
  user,
  filters,
  params,
  sp,
  fields,
  canWrite,
  now,
}: {
  user: Awaited<ReturnType<typeof requirePageAccess>>;
  filters: Parameters<typeof contentBoard>[1];
  params: ReturnType<typeof parseListParams<(typeof SORTS)[number]>>;
  sp: Record<string, string | string[] | undefined>;
  fields: ReturnType<typeof contentFields>;
  canWrite: boolean;
  now: Date;
}) {
  const { total, rows } = await listContent(user, { ...filters, sort: params.sort, dir: params.dir, skip: params.skip, take: params.pageSize });
  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "title",
      header: "Content",
      sortKey: "title",
      cell: (i) => (
        <div className="min-w-64">
          <p className="font-medium">{i.title}</p>
          <p className="text-xs text-muted-foreground">{[i.course?.title, i.topic?.title].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    { key: "type", header: "Type", hideOnMobile: true, cell: (i) => <StatusBadge meta={CONTENT_TYPE} value={i.type} dot={false} /> },
    {
      key: "stage",
      header: "Stage",
      sortKey: "stage",
      cell: (i) => <StatusMenu id={i.id} value={i.stage} meta={CONTENT_STAGE} options={CONTENT_PIPELINE} action={moveContentStageAction} disabled={!i.canMove} />,
    },
    { key: "assignee", header: "Tutor", hideOnMobile: true, cell: (i) => <UserChip name={i.assignee?.name} /> },
    { key: "reviewer", header: "Reviewer", hideOnMobile: true, cell: (i) => <span className="text-muted-foreground">{i.reviewer?.name ?? "—"}</span> },
    { key: "due", header: "Deadline", sortKey: "dueDate", cell: (i) => <DueDate date={i.dueDate} done={i.stage === "PUBLISHED"} now={now} /> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (i) =>
        canWrite && (
          <RowMenu
            label={i.title}
            edit={{ title: "Edit content item", action: updateContentAction, fields: [{ type: "hidden", name: "id", value: i.id }, ...fields], defaults: contentDefaults(i), size: "lg" }}
            remove={{ action: deleteContentAction, input: { id: i.id }, title: "Delete this content item?", description: `“${i.title}” will be removed from the pipeline.` }}
          />
        ),
    },
  ];
  return (
    <Card className="overflow-hidden">
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={params}
        pathname="/academic"
        searchParams={sp}
        empty={<EmptyState icon={GraduationCapIcon} title="No content items" description="Nothing matches these filters." />}
      />
    </Card>
  );
}
