import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangleIcon, CircleCheckIcon, GaugeIcon, PlusIcon, TargetIcon, Unlink2Icon } from "lucide-react";
import type { ObjectiveStatus } from "@prisma/client";
import { createObjectiveAction } from "@/server/actions/strategy";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { objectiveFormOptions, strategyOverview, type ObjectivePeriodFilter, type ObjectiveStatusFilter } from "@/server/services/strategy";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { EmptyState } from "@/components/common/empty-state";
import { KpiCard } from "@/components/common/kpi-card";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { sastYear } from "@/lib/dates";
import { formatNumber, formatPercent } from "@/lib/format";
import { OBJECTIVE_STATUS, optionsOf } from "@/lib/labels";
import { buildHref, first, oneOf } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { newObjectiveDefaults, objectiveFields, yearOptions } from "./fields";
import { AnnualContextHeader, AnnualObjectiveHeader, ObjectiveRow, attentionAccent } from "./objective-ui";

export const metadata: Metadata = { title: "Strategy" };

const PERIODS = ["annual", "1", "2", "3", "4"] as const;
const STATUSES = ["ATTENTION", ...(Object.keys(OBJECTIVE_STATUS) as ObjectiveStatus[])] as const satisfies readonly ObjectiveStatusFilter[];

const PERIOD_FILTER = {
  param: "quarter",
  label: "Periods",
  options: [{ value: "annual", label: "Annual only" }, ...[1, 2, 3, 4].map((q) => ({ value: String(q), label: `Q${q}` }))],
};
const STATUS_FILTER = { param: "status", label: "Statuses", options: [{ value: "ATTENTION", label: "Needs attention" }, ...optionsOf(OBJECTIVE_STATUS)] };

export default async function StrategyPage(props: PageProps<"/strategy">) {
  const user = await requirePageAccess("strategy.read");
  const sp = await props.searchParams;
  const now = new Date();
  const currentYear = sastYear(now);
  const yearParam = Number(first(sp.year));
  const year = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100 ? yearParam : currentYear;
  const periodParam = oneOf(first(sp.quarter), PERIODS);
  const period: ObjectivePeriodFilter = !periodParam ? "all" : periodParam === "annual" ? "annual" : (Number(periodParam) as 1 | 2 | 3 | 4);
  const status = oneOf<ObjectiveStatusFilter>(first(sp.status), STATUSES);
  const canWrite = can(user, "strategy.write");

  const [overview, options] = await Promise.all([strategyOverview(user, { year, period, status }), canWrite ? objectiveFormOptions(user, year) : null]);
  const { stats, groups, unlinked } = overview;
  const years = overview.years.some((y) => y.year === year) ? overview.years : [...overview.years, { year, count: overview.total }].sort((a, b) => a.year - b.year);
  const scopeLabel = period === "all" ? String(year) : period === "annual" ? `Annual ${year}` : `Q${period} ${year}`;

  const createDialog = options && (
    <FormDialog
      title="New objective"
      description="Annual objectives set the year's direction; quarterly objectives roll up to one of them."
      size="lg"
      trigger={
        <Button>
          <PlusIcon /> New objective
        </Button>
      }
      openParam="objective"
      action={createObjectiveAction}
      fields={objectiveFields({ ...options, years: yearOptions([year - 1, year, year + 1, currentYear, currentYear + 1]), withCurrentValue: true })}
      defaultValues={newObjectiveDefaults({
        year,
        quarter: typeof period === "number" ? period : null,
        ownerId: options.owners.some((o) => o.value === user.id) ? user.id : undefined,
      })}
      submitLabel="Create objective"
    />
  );

  return (
    <>
      <PageHeader
        title="Strategy"
        description={`${year} company objectives: the annual goals and the quarterly priorities that roll up to them.`}
        actions={createDialog}
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <LinkTabs
          tabs={years.map((y) => ({
            label: String(y.year),
            href: buildHref("/strategy", sp, { year: y.year === currentYear ? null : y.year }),
            active: y.year === year,
            count: y.count,
          }))}
        />
        <TableToolbar showSearch={false} filters={[PERIOD_FILTER, STATUS_FILTER]} className="p-0 sm:flex-nowrap" />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={`Objectives · ${scopeLabel}`}
          value={formatNumber(stats.total)}
          icon={TargetIcon}
          details={[
            { label: "Annual", value: formatNumber(stats.annual) },
            { label: "Quarterly", value: formatNumber(stats.quarterly) },
          ]}
        />
        <KpiCard
          label="Average progress"
          value={stats.averageProgress === null ? "—" : formatPercent(stats.averageProgress, 0)}
          icon={GaugeIcon}
          details={[
            { label: "Annual", value: stats.annualProgress === null ? "—" : formatPercent(stats.annualProgress, 0) },
            { label: "Quarterly", value: stats.quarterlyProgress === null ? "—" : formatPercent(stats.quarterlyProgress, 0) },
          ]}
        />
        <KpiCard
          label="On track"
          value={formatNumber(stats.byStatus.ON_TRACK)}
          icon={CircleCheckIcon}
          details={[
            { label: "Completed", value: formatNumber(stats.byStatus.COMPLETED) },
            { label: "Due in 30 days", value: formatNumber(stats.dueSoon) },
          ]}
        />
        <KpiCard
          label="Needing attention"
          value={formatNumber(stats.attention)}
          icon={AlertTriangleIcon}
          href={stats.attention > 0 && status !== "ATTENTION" ? buildHref("/strategy", sp, { status: "ATTENTION" }) : undefined}
          className={cn(stats.attention > 0 && "border-warning/50")}
          details={[
            { label: "At risk", value: formatNumber(stats.byStatus.AT_RISK) },
            { label: "Delayed", value: formatNumber(stats.byStatus.DELAYED) },
            { label: "Past deadline", value: formatNumber(stats.overdue) },
          ]}
        />
      </div>

      {overview.total === 0 ? (
        <Card>
          <EmptyState
            icon={TargetIcon}
            title={`No objectives for ${year} yet`}
            description={
              canWrite
                ? "Use “New objective” to set the year's annual company objectives, then add the quarterly objectives that deliver them."
                : "Company objectives for this year will appear here once they're set."
            }
          />
        </Card>
      ) : groups.length === 0 && unlinked.length === 0 ? (
        <Card>
          <EmptyState
            icon={TargetIcon}
            title="No objectives match these filters"
            description={status === "ATTENTION" ? `Nothing in ${scopeLabel} is at risk, delayed or past its deadline.` : "Try another period or status."}
            action={
              <Button asChild variant="outline" size="sm">
                <Link href={buildHref("/strategy", sp, { quarter: null, status: null })}>Clear filters</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.some((g) => !g.matches) && (
            <p className="text-xs text-muted-foreground">Shaded rows are the annual objectives that the matching quarterly objectives support.</p>
          )}
          {groups.map((g) => (
            <Card key={g.objective.id} className={cn("overflow-hidden", g.matches && attentionAccent(g.objective))}>
              {g.matches ? <AnnualObjectiveHeader o={g.objective} now={now} /> : <AnnualContextHeader o={g.objective} />}
              {g.children.length > 0 && (
                <ul className="divide-y divide-border border-t border-border" aria-label={`Quarterly objectives for ${g.objective.title}`}>
                  {g.children.map((c) => (
                    <ObjectiveRow key={c.id} o={c} now={now} nested />
                  ))}
                </ul>
              )}
              {g.matches && g.children.length === 0 && (
                <p className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
                  {g.childCount > 0 ? (
                    <>
                      {g.childCount} quarterly objective{g.childCount === 1 ? "" : "s"} hidden by the filters ·{" "}
                      <Link href={buildHref("/strategy", sp, { quarter: null, status: null })} className="font-medium text-foreground hover:underline">
                        Show all
                      </Link>
                    </>
                  ) : (
                    <>
                      No quarterly objectives yet.{" "}
                      {canWrite && (
                        <Link href={`/strategy/${g.objective.id}?new=quarterly`} className="font-medium text-foreground hover:underline">
                          Add one
                        </Link>
                      )}
                    </>
                  )}
                </p>
              )}
            </Card>
          ))}
          {unlinked.length > 0 && (
            <SectionCard
              title={
                <span className="inline-flex items-center gap-2">
                  <Unlink2Icon className="size-4 text-muted-foreground" /> Not linked to an annual objective
                </span>
              }
              description={`Quarterly objectives that don't roll up to a ${year} annual objective.${canWrite ? " Link them from their edit form." : ""}`}
              flush
            >
              <ul className="divide-y divide-border border-t border-border">
                {unlinked.map((o) => (
                  <ObjectiveRow key={o.id} o={o} now={now} />
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      )}
    </>
  );
}
