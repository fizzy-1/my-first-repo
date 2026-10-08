import Link from "next/link";
import { CornerDownRightIcon } from "lucide-react";
import type { ObjectiveMetric, ObjectiveStatus } from "@prisma/client";
import { DueDate } from "@/components/common/due-date";
import { StatusBadge } from "@/components/common/status-badge";
import { UserChip } from "@/components/common/user-chip";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { endOfSastDay } from "@/lib/dates";
import { formatDate, formatNumber, formatRelative, formatZAR } from "@/lib/format";
import { OBJECTIVE_METRIC, OBJECTIVE_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** The fields every objective view needs (list items, children and parents share them). */
export interface ObjectiveView {
  id: string;
  title: string;
  year: number;
  quarter: number | null;
  metric: ObjectiveMetric;
  unit: string;
  startValue: number;
  currentValue: number;
  targetValue: number;
  progress: number;
  isLive: boolean;
  status: ObjectiveStatus;
  deadline: Date;
  overdue: boolean;
  needsAttention: boolean;
  lastUpdateAt: Date | null;
  owner: { name: string };
  department: { name: string } | null;
}

const decimalsOf = (v: number) => (Math.abs(v - Math.round(v)) < 1e-9 ? 0 : Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? 1 : 2);

/** "R325,912", "65%", "1,670 learners", "11.2 months". `withUnit: false` drops word units (not R or %). */
export function formatObjectiveValue(value: number, unit: string, opts: { withUnit?: boolean; compact?: boolean } = {}): string {
  if (unit === "ZAR") return formatZAR(value, { compact: opts.compact && Math.abs(value) >= 100_000 });
  const n = formatNumber(value, { decimals: decimalsOf(value) || undefined, compact: opts.compact });
  if (unit === "%") return `${n}%`;
  return (opts.withUnit ?? true) && unit ? `${n} ${unit}` : n;
}

export function progressTone(status: ObjectiveStatus) {
  return status === "DELAYED" ? "danger" : status === "AT_RISK" ? "warning" : status === "COMPLETED" ? "success" : "primary";
}

/** Strip the "Live: " prefix from the metric label ("paying learners"). */
export function metricSource(metric: ObjectiveMetric) {
  return OBJECTIVE_METRIC[metric].label.replace(/^Live: /, "");
}

export function periodText(o: { year: number; quarter: number | null }) {
  return o.quarter ? `Q${o.quarter} ${o.year}` : `Annual ${o.year}`;
}

export function PeriodTag({ quarter, className }: { quarter: number | null; className?: string }) {
  return (
    <span
      className={cn(
        "tabular inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-semibold",
        quarter ? "bg-primary-soft text-primary-soft-foreground" : "bg-gold-soft text-gold-foreground",
        className,
      )}
    >
      {quarter ? `Q${quarter}` : "Annual"}
    </span>
  );
}

/** Marks a metric-linked objective; the value beside it was computed on this page load. */
export function LiveBadge({ metric, isLive, showSource }: { metric: ObjectiveMetric; isLive: boolean; showSource?: boolean }) {
  if (metric === "MANUAL") return null;
  const source = metricSource(metric);
  return (
    <Badge tone="outline" title={isLive ? `Computed live from ${source}` : `Live ${source} unavailable: showing the last captured value`}>
      <span aria-hidden className={cn("size-1.5 rounded-full", isLive ? "bg-primary motion-safe:animate-pulse" : "bg-muted-foreground")} />
      {isLive ? (showSource ? `Live · ${source}` : "Live") : "Live value unavailable"}
      {isLive && !showSource && <span className="sr-only"> value from {source}</span>}
    </Badge>
  );
}

export function lastUpdateText(o: { lastUpdateAt: Date | null }, now: Date) {
  return o.lastUpdateAt ? `Updated ${formatRelative(o.lastUpdateAt, now)}` : "No check-ins yet";
}

/** Current vs target with a status-toned bar. */
export function ObjectiveProgress({ o, size = "md", className }: { o: ObjectiveView; size?: "sm" | "md" | "lg"; className?: string }) {
  const pct = Math.round(o.progress);
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <p className="tabular min-w-0 truncate text-xs text-muted-foreground">
          <span className={cn("font-semibold text-foreground", size === "lg" ? "text-xl tracking-tight" : size === "md" ? "text-base" : "text-[13px]")}>
            {formatObjectiveValue(o.currentValue, o.unit, { withUnit: false })}
          </span>{" "}
          of {formatObjectiveValue(o.targetValue, o.unit)}
        </p>
        <span className={cn("tabular shrink-0 font-medium", size === "sm" ? "text-xs" : "text-sm")}>{pct}%</span>
      </div>
      <Progress value={o.progress} tone={progressTone(o.status)} label={`${o.title}: ${pct}% of target`} className={size === "lg" ? "h-2" : undefined} />
    </div>
  );
}

/** Deadline as a "due by" date (the deadline day counts until it ends in SAST). */
export function ObjectiveDeadline({ o, now }: { o: { deadline: Date; status: ObjectiveStatus }; now: Date }) {
  return <DueDate date={endOfSastDay(o.deadline)} done={o.status === "COMPLETED"} now={now} />;
}

/** Card header for an annual objective on the strategy page; the whole header opens it. */
export function AnnualObjectiveHeader({ o, now }: { o: ObjectiveView; now: Date }) {
  return (
    <div className="relative p-5 transition-colors hover:bg-accent/30">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <PeriodTag quarter={null} />
            {o.department?.name ?? "Company-wide"}
          </p>
          <h2 className="mt-2 text-base font-semibold tracking-tight text-balance">
            <Link href={`/strategy/${o.id}`} className="after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:rounded-t-xl focus-visible:after:ring-2 focus-visible:after:ring-ring/60">
              {o.title}
            </Link>
          </h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <LiveBadge metric={o.metric} isLive={o.isLive} />
          <StatusBadge meta={OBJECTIVE_STATUS} value={o.status} />
        </div>
      </div>
      <ObjectiveProgress o={o} size="lg" className="mt-4" />
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <UserChip name={o.owner.name} className="text-foreground" />
        <span className="inline-flex items-center gap-1">
          Due <ObjectiveDeadline o={o} now={now} />
        </span>
        <span title={o.lastUpdateAt ? formatDate(o.lastUpdateAt) : undefined}>{lastUpdateText(o, now)}</span>
      </div>
    </div>
  );
}

/** Compact context line for an annual objective shown only because its quarterly objectives match the filters. */
export function AnnualContextHeader({ o }: { o: ObjectiveView }) {
  return (
    <div className="relative flex flex-wrap items-center gap-x-2.5 gap-y-1 bg-muted/40 px-5 py-3 transition-colors hover:bg-muted/70">
      <PeriodTag quarter={null} />
      <Link href={`/strategy/${o.id}`} className="min-w-0 flex-1 truncate text-sm font-medium after:absolute after:inset-0 hover:underline">
        {o.title}
      </Link>
      <span className="tabular text-xs text-muted-foreground">{Math.round(o.progress)}%</span>
      <StatusBadge meta={OBJECTIVE_STATUS} value={o.status} />
    </div>
  );
}

/** One quarterly objective row; `nested` indents it under its annual objective. */
export function ObjectiveRow({ o, now, nested, showYear }: { o: ObjectiveView; now: Date; nested?: boolean; showYear?: boolean }) {
  return (
    <li className="relative transition-colors hover:bg-accent/40">
      <div className={cn("grid gap-3 py-3.5 pr-5 pl-5 md:grid-cols-[minmax(0,1fr)_minmax(180px,240px)_auto] md:items-center md:gap-6", nested && "sm:pl-6")}>
        <div className="flex min-w-0 gap-2">
          {nested && <CornerDownRightIcon aria-hidden className="mt-0.5 hidden size-4 shrink-0 text-muted-foreground sm:block" />}
          <div className="min-w-0">
            <div className="flex items-start gap-2">
              <PeriodTag quarter={o.quarter} />
              <Link href={`/strategy/${o.id}`} className="min-w-0 text-sm leading-5 font-medium text-balance after:absolute after:inset-0 hover:underline">
                {o.title}
              </Link>
            </div>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{o.owner.name}</span>
              {o.department && <span>{o.department.name}</span>}
              {showYear && <span>{periodText(o)}</span>}
              <span className="inline-flex items-center gap-1">
                Due <ObjectiveDeadline o={o} now={now} />
              </span>
              <span title={o.lastUpdateAt ? formatDate(o.lastUpdateAt) : undefined}>{lastUpdateText(o, now)}</span>
            </p>
          </div>
        </div>
        <ObjectiveProgress o={o} size="sm" />
        <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
          <LiveBadge metric={o.metric} isLive={o.isLive} />
          <StatusBadge meta={OBJECTIVE_STATUS} value={o.status} />
        </div>
      </div>
    </li>
  );
}

/** Left accent for annual cards that need attention (status colour reflects status). */
export function attentionAccent(o: { status: ObjectiveStatus; overdue: boolean }) {
  if (o.status === "DELAYED" || (o.overdue && o.status !== "AT_RISK")) return "border-l-[3px] border-l-danger";
  if (o.status === "AT_RISK") return "border-l-[3px] border-l-warning";
  return undefined;
}
