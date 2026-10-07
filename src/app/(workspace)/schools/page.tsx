import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClockIcon, PlusIcon, SchoolIcon } from "lucide-react";
import { Province, SchoolStage } from "@prisma/client";
import { createSchoolAction, deleteSchoolAction, moveSchoolStageAction, updateSchoolAction } from "@/server/actions/schools";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { activeUserOptions } from "@/server/rbac";
import { schoolKpis, currentPeriods } from "@/server/services/metrics";
import { listSchools, schoolBoard, upcomingRenewals, type SchoolSort } from "@/server/services/schools";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { DueDate } from "@/components/common/due-date";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { UserChip } from "@/components/common/user-chip";
import { FormDialog } from "@/components/forms/form-dialog";
import { RowMenu } from "@/components/forms/row-menu";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { optionsOf, PROVINCE, SCHOOL_PIPELINE, SCHOOL_STAGE } from "@/lib/labels";
import { formatDate, formatNumber, formatPercent, formatZAR } from "@/lib/format";
import { buildHref, exportHref, oneOf, parseListParams } from "@/lib/list-params";
import { schoolDefaults, schoolFields } from "./fields";

export const metadata: Metadata = { title: "Schools & Partnerships" };

const SORTS = ["name", "stage", "expectedAnnualValue", "nextFollowUpAt", "potentialLearners", "updatedAt"] as const satisfies readonly SchoolSort[];

export default async function SchoolsPage(props: PageProps<"/schools">) {
  const user = await requirePageAccess("schools.read");
  const sp = await props.searchParams;
  const view = params(sp).filter("view") === "board" ? "board" : "list";
  const p = params(sp);
  const canWrite = can(user, "schools.write");
  const owners = await activeUserOptions();
  const ownerOpts = owners.map(({ value, label }) => ({ value, label }));
  const filters = {
    stage: oneOf<SchoolStage>(p.filter("stage"), SchoolStage),
    province: oneOf<Province>(p.filter("province"), Province),
    ownerId: p.filter("owner"),
  };
  const [kpis, renewals] = await Promise.all([schoolKpis(currentPeriods()), upcomingRenewals(60)]);
  const fields = schoolFields(ownerOpts);
  const overdueFollowUps = await listSchools(user, { followUp: "overdue", sort: "name", dir: "asc", skip: 0, take: 0 });

  const header = (
    <>
      <PageHeader
        title="Schools & partnerships"
        description="CRM for school partnerships — from first contact to active, invoicing partner."
        actions={
          <>
            <Button variant="outline" asChild className="hidden sm:inline-flex">
              <a href={exportHref("/api/reports/schools", sp)} download>
                Export CSV
              </a>
            </Button>
            {canWrite && (
              <FormDialog
                title="Add school"
                size="lg"
                trigger={
                  <Button>
                    <PlusIcon /> Add school
                  </Button>
                }
                openParam="school"
                action={createSchoolAction}
                fields={fields}
                defaultValues={schoolDefaults()}
                submitLabel="Add school"
                successHref="/schools/{id}"
              />
            )}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Active partnerships", formatNumber(kpis.activePartnerships)],
          ["Open prospects", formatNumber(kpis.prospects)],
          ["Open pipeline value", formatZAR(kpis.openPipelineValue, { compact: true })],
          ["Weighted pipeline", formatZAR(kpis.weightedPipelineValue, { compact: true })],
          ["Conversion (won ÷ closed)", formatPercent(kpis.conversionRate, 0)],
        ].map(([label, value]) => (
          <Card key={label} className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="tabular mt-1 text-lg font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      {(overdueFollowUps.total > 0 || renewals.length > 0) && (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {overdueFollowUps.total > 0 && (
            <Link href="/schools?followUp=overdue" className="flex items-center gap-3 rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
              <CalendarClockIcon className="size-4" /> {overdueFollowUps.total} school follow-up{overdueFollowUps.total === 1 ? " is" : "s are"} overdue
            </Link>
          )}
          {renewals.length > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
              <p className="font-medium">Contracts up for renewal in the next 60 days</p>
              <ul className="mt-1 space-y-0.5">
                {renewals.map((r) => (
                  <li key={r.id}>
                    <Link href={`/schools/${r.school.id}`} className="hover:underline">
                      {r.school.name}
                    </Link>{" "}
                    — ends {formatDate(r.endDate)} · {formatZAR(r.annualValue)}/yr
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <LinkTabs
        className="mb-4"
        tabs={[
          { label: "List", href: buildHref("/schools", sp, { view: undefined, page: undefined }), active: view === "list" },
          { label: "Pipeline board", href: buildHref("/schools", sp, { view: "board", page: undefined, sort: undefined, dir: undefined }), active: view === "board" },
        ]}
      />
    </>
  );

  if (view === "board") {
    const schools = await schoolBoard(user, { ownerId: filters.ownerId, province: filters.province, q: p.q || undefined });
    const now = new Date();
    return (
      <>
        {header}
        <KanbanBoard
          canMove={canWrite}
          moveAction={moveSchoolStageAction}
          emptyText="No schools"
          columns={[...SCHOOL_PIPELINE, "LOST" as const].map((stage) => ({
            id: stage,
            label: SCHOOL_STAGE[stage].label,
            summary: formatZAR(schools.filter((s) => s.stage === stage).reduce((sum, s) => sum + s.expectedAnnualValue, 0), { compact: true }),
          }))}
          cards={schools.map((s) => ({
            id: s.id,
            columnId: s.stage,
            title: s.name,
            href: `/schools/${s.id}`,
            lines: [`${s.city} · ${PROVINCE[s.province].label}`, `${formatNumber(s.potentialLearners)} potential learners`],
            urgent: s.nextFollowUpAt && new Date(s.nextFollowUpAt) < now && s.stage !== "LOST" ? "Follow-up overdue" : undefined,
            footerLeft: s.owner?.name ?? "Unassigned",
            footerRight: `${formatZAR(s.expectedAnnualValue, { compact: true })} · ${s.probability}%`,
          }))}
        />
      </>
    );
  }

  const list = await listSchools(user, {
    q: p.q || undefined,
    ...filters,
    followUp: p.filter("followUp") === "overdue" ? "overdue" : p.filter("followUp") === "week" ? "week" : undefined,
    sort: p.sort,
    dir: p.dir,
    skip: p.skip,
    take: p.pageSize,
  });

  const columns: Column<(typeof list.rows)[number]>[] = [
    {
      key: "name",
      header: "School",
      sortKey: "name",
      cell: (s) => (
        <div className="min-w-52">
          <Link href={`/schools/${s.id}`} className="font-medium hover:underline">
            {s.name}
          </Link>
          <p className="text-xs text-muted-foreground">
            {s.city} · {PROVINCE[s.province].label}
          </p>
        </div>
      ),
    },
    { key: "stage", header: "Stage", sortKey: "stage", cell: (s) => <StatusBadge meta={SCHOOL_STAGE} value={s.stage} /> },
    {
      key: "contact",
      header: "Contact",
      hideOnMobile: true,
      cell: (s) =>
        s.primaryContact ? (
          <div className="min-w-40 text-xs">
            <p className="font-medium text-foreground">{s.primaryContact.name}</p>
            <p className="text-muted-foreground">{s.primaryContact.position}</p>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: "learners", header: "Potential learners", sortKey: "potentialLearners", align: "right", hideOnMobile: true, cell: (s) => <span className="tabular">{formatNumber(s.potentialLearners)}</span> },
    { key: "value", header: "Expected / yr", sortKey: "expectedAnnualValue", align: "right", cell: (s) => <span className="tabular font-medium">{formatZAR(s.expectedAnnualValue)}</span> },
    { key: "owner", header: "Owner", hideOnMobile: true, cell: (s) => <UserChip name={s.owner?.name} /> },
    { key: "follow", header: "Follow-up", sortKey: "nextFollowUpAt", cell: (s) => <DueDate date={s.nextFollowUpAt} done={s.stage === "LOST"} /> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (s) =>
        canWrite && (
          <RowMenu
            label={s.name}
            href={`/schools/${s.id}`}
            edit={{ title: `Edit ${s.name}`, action: updateSchoolAction, fields: [{ type: "hidden", name: "id", value: s.id }, ...fields], defaults: schoolDefaults(s), size: "lg" }}
            remove={{ action: deleteSchoolAction, input: { id: s.id }, title: `Delete ${s.name}?`, description: "Contacts and notes are deleted too. Schools with partnerships or invoices can't be deleted — mark them as Lost instead." }}
          />
        ),
    },
  ];

  return (
    <>
      {header}
      <Card className="overflow-hidden">
        <TableToolbar
          searchPlaceholder="Search school, city, contact or EMIS…"
          filters={[
            { param: "stage", label: "Stage", options: optionsOf(SCHOOL_STAGE) },
            { param: "province", label: "Province", options: optionsOf(PROVINCE) },
            { param: "owner", label: "Owner", options: ownerOpts },
            { param: "followUp", label: "Follow-up", options: [{ value: "overdue", label: "Overdue" }, { value: "week", label: "Due this week" }] },
          ]}
        >
          <span className="tabular text-xs text-muted-foreground">
            {formatZAR(list.totals.value, { compact: true })} expected · {formatNumber(list.totals.learners)} potential learners
          </span>
        </TableToolbar>
        <DataTable
          columns={columns}
          rows={list.rows}
          total={list.total}
          params={p}
          pathname="/schools"
          searchParams={sp}
          empty={<EmptyState icon={SchoolIcon} title="No schools found" description="Add schools to build the partnership pipeline." />}
        />
      </Card>
    </>
  );
}

function params(sp: Record<string, string | string[] | undefined>) {
  return parseListParams(sp, { sortable: SORTS, defaultSort: "expectedAnnualValue", defaultDir: "desc", pageSize: 25 });
}
