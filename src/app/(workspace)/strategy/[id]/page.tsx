import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheckIcon, ListPlusIcon, PencilIcon, Unlink2Icon } from "lucide-react";
import { createObjectiveAction, recordObjectiveUpdateAction, updateObjectiveAction } from "@/server/actions/strategy";
import { requirePageAccess } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors";
import { getObjective, objectiveFormOptions } from "@/server/services/strategy";
import { ChartCard } from "@/components/charts/chart-card";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { UserChip } from "@/components/common/user-chip";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { quarterOf, sastYear } from "@/lib/dates";
import { formatDate, formatDateTime, formatRelative, formatShortDate } from "@/lib/format";
import { OBJECTIVE_STATUS } from "@/lib/labels";
import { newObjectiveDefaults, objectiveDefaults, objectiveFields, progressFields, yearOptions } from "../fields";
import {
  LiveBadge,
  ObjectiveDeadline,
  ObjectiveProgress,
  ObjectiveRow,
  PeriodTag,
  formatObjectiveValue,
  lastUpdateText,
  metricSource,
  periodText,
} from "../objective-ui";
import { DeleteObjectiveButton } from "./delete-objective-button";

export const metadata: Metadata = { title: "Objective" };

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/60 px-3 py-2.5">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="tabular truncate text-base font-semibold">{value}</p>
      {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

export default async function ObjectivePage(props: PageProps<"/strategy/[id]">) {
  const { id } = await props.params;
  const user = await requirePageAccess("strategy.read");
  let o: Awaited<ReturnType<typeof getObjective>>;
  try {
    o = await getObjective(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const options = o.canEdit ? await objectiveFormOptions(user, o.year) : null;
  const now = new Date();
  const currentYear = sastYear(now);
  const listHref = o.year === currentYear ? "/strategy" : `/strategy?year=${o.year}`;
  const history = [...o.updates].reverse();
  const increasing = o.targetValue >= o.startValue;
  const remaining = increasing ? o.targetValue - o.currentValue : o.currentValue - o.targetValue;
  const chartFormat = o.unit === "ZAR" ? "zar" : o.unit === "%" ? "percent" : "number";
  const fmt = (v: number) => formatObjectiveValue(v, o.unit);
  const years = yearOptions([o.year - 1, o.year, o.year + 1, currentYear, currentYear + 1]);

  const deleteDescription = [
    `“${o.title}”${o.updates.length ? ` and its ${o.updates.length} check-in${o.updates.length === 1 ? "" : "s"}` : ""} will be permanently deleted.`,
    o.children.length
      ? o.children.length === 1
        ? "Its quarterly objective is kept but unlinked, and its owner is notified so they can link it to another annual objective."
        : `Its ${o.children.length} quarterly objectives are kept but unlinked, and their owners are notified so they can link them to another annual objective.`
      : "",
    "The deletion is recorded in the audit log.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Strategy", href: listHref },
          ...(o.parent ? [{ label: o.parent.title, href: `/strategy/${o.parent.id}` }] : []),
          { label: o.title },
        ]}
        title={o.title}
        description={o.description ?? undefined}
        meta={
          <>
            <PeriodTag quarter={o.quarter} />
            <span className="text-xs text-muted-foreground">{o.year}</span>
            <StatusBadge meta={OBJECTIVE_STATUS} value={o.status} />
            <LiveBadge metric={o.metric} isLive={o.isLive} showSource />
            {o.overdue && <span className="text-xs font-medium text-danger">Past deadline</span>}
          </>
        }
        actions={
          <>
            {o.canRecord && (
              <FormDialog
                title="Record progress"
                description={o.metric === "MANUAL" ? "Check-ins build the progress history and set the objective's status." : "Check-ins capture the live value, set the status and add context."}
                trigger={
                  <Button>
                    <ClipboardCheckIcon /> Record progress
                  </Button>
                }
                openParam="progress"
                action={recordObjectiveUpdateAction}
                fields={progressFields(o)}
                defaultValues={{ value: String(o.currentValue), status: o.status }}
                submitLabel="Save check-in"
              />
            )}
            {options && (
              <FormDialog
                title="Edit objective"
                description="Progress changes go through check-ins so they're kept in the history."
                size="lg"
                trigger={
                  <Button variant="outline">
                    <PencilIcon /> Edit
                  </Button>
                }
                action={updateObjectiveAction}
                fields={[{ type: "hidden", name: "id", value: o.id }, ...objectiveFields({ ...options, parents: options.parents.filter((p) => p.value !== o.id), years })]}
                defaultValues={objectiveDefaults(o)}
                submitLabel="Save changes"
              />
            )}
            {o.canEdit && <DeleteObjectiveButton id={o.id} title={`Delete “${o.title}”?`} description={deleteDescription} returnTo={listHref} />}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <SectionCard
            title="Progress"
            description={
              o.metric === "MANUAL"
                ? "Moves with each check-in."
                : o.isLive
                  ? `Current value computed live from ${metricSource(o.metric)} when this page loaded.`
                  : `Live ${metricSource(o.metric)} is unavailable right now, so the last captured value is shown.`
            }
          >
            <ObjectiveProgress o={o} size="lg" />
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Start" value={fmt(o.startValue)} />
              <Stat label={o.isLive ? "Current (live)" : "Current"} value={fmt(o.currentValue)} sub={o.isLive ? "Updates automatically" : lastUpdateText(o, now)} />
              <Stat label="Target" value={fmt(o.targetValue)} sub={<>Due {formatDate(o.deadline)}</>} />
              <Stat
                label={remaining > 0 ? "To go" : "Target"}
                value={remaining > 0 ? fmt(remaining) : "Reached"}
                sub={remaining > 0 ? `${Math.round(o.progress)}% of the way` : `${fmt(o.currentValue)} vs ${fmt(o.targetValue)}`}
              />
            </div>
          </SectionCard>

          {history.length >= 2 && (
            <ChartCard
              title="Progress history"
              description={`Value recorded at each check-in${o.metric === "MANUAL" ? "" : " (the live value at that moment)"}, against the target.`}
              data={history.map((u) => ({ label: formatShortDate(u.createdAt), value: u.value, target: o.targetValue }))}
              series={[
                { key: "value", label: "Recorded value", slot: 1, type: "line" },
                { key: "target", label: "Target", slot: 2, type: "line" },
              ]}
              format={chartFormat}
              height={240}
            />
          )}

          <SectionCard title="Check-ins" description="Every progress update, newest first." flush>
            {o.updates.length === 0 ? (
              <EmptyState
                compact
                icon={ClipboardCheckIcon}
                title="No check-ins yet"
                description={o.canRecord ? "Use “Record progress” to log the current value, status and any risks." : `${o.owner.name} records progress here.`}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Note</TableHead>
                    <TableHead className="hidden sm:table-cell">By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {o.updates.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="align-top">
                        <span className="whitespace-nowrap" title={formatDateTime(u.createdAt)}>
                          {formatDate(u.createdAt)}
                        </span>
                        <span className="block text-xs text-muted-foreground sm:hidden">{u.author.name}</span>
                        {u.note && <p className="mt-1 max-w-xs text-xs whitespace-pre-wrap text-muted-foreground md:hidden">{u.note}</p>}
                      </TableCell>
                      <TableCell className="tabular text-right align-top whitespace-nowrap">{fmt(u.value)}</TableCell>
                      <TableCell className="align-top">
                        <StatusBadge meta={OBJECTIVE_STATUS} value={u.status} />
                      </TableCell>
                      <TableCell className="hidden max-w-md align-top text-sm whitespace-pre-wrap text-muted-foreground md:table-cell">{u.note ?? "—"}</TableCell>
                      <TableCell className="hidden align-top whitespace-nowrap sm:table-cell">{u.author.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>

          {o.quarter === null && (
            <SectionCard
              title="Quarterly objectives"
              description="The quarterly priorities that deliver this objective."
              flush
              actions={
                options && (
                  <FormDialog
                    title="Add quarterly objective"
                    description={`Rolls up to “${o.title}”.`}
                    size="lg"
                    trigger={
                      <Button size="sm" variant="outline">
                        <ListPlusIcon /> Add quarterly
                      </Button>
                    }
                    openParam="quarterly"
                    action={createObjectiveAction}
                    fields={objectiveFields({ ...options, years: yearOptions([o.year]), withCurrentValue: true })}
                    defaultValues={newObjectiveDefaults({
                      year: o.year,
                      quarter: o.year === currentYear ? quarterOf(now) : 1,
                      parentId: o.id,
                      departmentId: o.departmentId,
                      ownerId: o.ownerId,
                    })}
                    submitLabel="Create objective"
                  />
                )
              }
            >
              {o.children.length === 0 ? (
                <EmptyState compact title="No quarterly objectives yet" description="Quarterly objectives that roll up to this one will appear here." />
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {o.children.map((c) => (
                    <ObjectiveRow key={c.id} o={c} now={now} />
                  ))}
                </ul>
              )}
            </SectionCard>
          )}
        </div>

        <div className="space-y-6">
          <SectionCard title="Details">
            <dl className="space-y-3 text-sm">
              <DetailRow label="Owner">
                <UserChip name={o.owner.name} subtitle={o.owner.jobTitle} className="text-left" />
              </DetailRow>
              <DetailRow label="Department">{o.department?.name ?? "Company-wide"}</DetailRow>
              <DetailRow label="Period">{periodText(o)}</DetailRow>
              <DetailRow label="Deadline">
                <ObjectiveDeadline o={o} now={now} />
              </DetailRow>
              <DetailRow label="Progress source">{o.metric === "MANUAL" ? "Manual check-ins" : `Live · ${metricSource(o.metric)}`}</DetailRow>
              <DetailRow label="Unit">{o.unit || "—"}</DetailRow>
              <DetailRow label="Last check-in">
                <span title={o.lastUpdateAt ? formatDateTime(o.lastUpdateAt) : undefined}>{o.lastUpdateAt ? formatRelative(o.lastUpdateAt, now) : "None yet"}</span>
              </DetailRow>
              <DetailRow label="Created">{formatDate(o.createdAt)}</DetailRow>
            </dl>
          </SectionCard>

          {o.quarter !== null &&
            (o.parent ? (
              <SectionCard title="Rolls up to">
                <Link href={`/strategy/${o.parent.id}`} className="group block rounded-lg border border-border p-3 transition-colors hover:border-primary/40 hover:bg-accent/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <PeriodTag quarter={null} />
                      <p className="mt-1.5 text-sm font-medium group-hover:underline">{o.parent.title}</p>
                    </div>
                    <StatusBadge meta={OBJECTIVE_STATUS} value={o.parent.status} />
                  </div>
                  <ObjectiveProgress o={o.parent} size="sm" className="mt-3" />
                </Link>
              </SectionCard>
            ) : (
              <SectionCard
                title={
                  <span className="inline-flex items-center gap-2">
                    <Unlink2Icon className="size-4 text-muted-foreground" /> Not linked
                  </span>
                }
              >
                <p className="text-sm text-muted-foreground">
                  This quarterly objective doesn&apos;t roll up to an annual objective.{o.canEdit ? " Use Edit to link it to one." : ""}
                </p>
              </SectionCard>
            ))}
        </div>
      </div>
    </>
  );
}
