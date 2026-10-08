import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CONTENT_PIPELINE, CONTENT_STAGE, OBJECTIVE_STATUS } from "@/lib/labels";
import { formatDate, formatDelta, formatNumber, formatPercent, formatZAR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardData } from "./types";

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/60 px-3 py-2.5">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="tabular truncate text-base font-semibold">{value}</p>
      {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function formatObjectiveValue(value: number, unit: string) {
  if (unit === "ZAR") return formatZAR(value, { compact: value >= 100_000 });
  if (unit === "%") return formatPercent(value, 0);
  return `${formatNumber(value, { decimals: Number.isInteger(value) ? undefined : 1 })}${unit ? ` ${unit}` : ""}`;
}

export function ObjectivesCard({ data }: { data: NonNullable<DashboardData["objectives"]> }) {
  const list = [...data.annual, ...data.quarterly].slice(0, 6);
  return (
    <SectionCard
      title="Strategic objectives"
      description={`${data.year} company objectives and Q${data.quarter} priorities`}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/strategy">Strategy centre</Link>
        </Button>
      }
    >
      <div className="mb-4 flex items-center gap-4">
        <div className="flex-1">
          <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted-foreground">
            <span>Company-wide progress</span>
            <span className="tabular text-sm font-semibold text-foreground">{formatPercent(data.overall, 0)}</span>
          </div>
          <Progress value={data.overall} label="Company-wide objective progress" />
        </div>
        <div className="flex gap-1.5">
          {(["ON_TRACK", "AT_RISK", "DELAYED"] as const).map((s) =>
            data.byStatus[s] ? (
              <Badge key={s} tone={OBJECTIVE_STATUS[s].tone}>
                {data.byStatus[s]} {OBJECTIVE_STATUS[s].label.toLowerCase()}
              </Badge>
            ) : null,
          )}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No objectives set for {data.year}.</p>
      ) : (
        <ul className="space-y-3.5">
          {list.map((o) => (
            <li key={o.id}>
              <div className="flex items-center gap-2">
                <Link href={`/strategy/${o.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                  {o.title}
                </Link>
                {o.quarter && <span className="text-[11px] text-muted-foreground">Q{o.quarter}</span>}
                <StatusBadge meta={OBJECTIVE_STATUS} value={o.status} />
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <Progress
                  value={o.progress}
                  tone={o.status === "DELAYED" ? "danger" : o.status === "AT_RISK" ? "warning" : o.status === "COMPLETED" ? "success" : "primary"}
                  label={`${o.title} progress`}
                />
                <span className="tabular w-10 shrink-0 text-right text-xs text-muted-foreground">{Math.round(o.progress)}%</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatObjectiveValue(o.currentValue, o.unit)} of {formatObjectiveValue(o.targetValue, o.unit)} · {o.owner.name} · due {formatDate(o.deadline)}
                {o.isLive && " · live metric"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function MarketingCard({ data }: { data: NonNullable<DashboardData["marketing"]> }) {
  return (
    <SectionCard
      title="Marketing performance"
      description="Last 30 days across campaigns"
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/marketing">Campaigns</Link>
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Active campaigns" value={formatNumber(data.activeCampaigns)} />
        <Stat label="Spend" value={formatZAR(data.spend)} />
        <Stat label="Leads" value={formatNumber(data.leads)} sub={data.leadsGrowth !== null ? `${formatDelta(data.leadsGrowth)} vs prior 30 days` : undefined} />
        <Stat label="Conversions" value={formatNumber(data.conversions)} />
        <Stat label="Cost per lead" value={data.costPerLead !== null ? formatZAR(data.costPerLead) : "—"} />
        <Stat label="Cost per acquisition" value={data.costPerAcquisition !== null ? formatZAR(data.costPerAcquisition) : "—"} />
      </div>
      {data.campaigns.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {data.campaigns.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
              <Link href={`/marketing/${c.id}`} className="min-w-0 flex-1 truncate hover:underline">
                {c.name}
              </Link>
              <span className="tabular text-xs text-muted-foreground">{formatNumber(c.leads)} leads</span>
              <span className="tabular w-20 text-right text-xs text-muted-foreground">{c.cpl !== null ? `${formatZAR(c.cpl)} CPL` : "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function AcademicCard({ data }: { data: NonNullable<DashboardData["academic"]> }) {
  const total = CONTENT_PIPELINE.reduce((s, stage) => s + (data.stageCount[stage] ?? 0), 0) || 1;
  return (
    <SectionCard
      title="Academic progress"
      description="Content production and learner engagement"
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/academic">Academic centre</Link>
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Published this month" value={formatNumber(data.publishedThisMonth)} />
        <Stat label="In production · review" value={`${data.inProduction} · ${data.inReview}`} />
        <Stat
          label="Weekly active learners"
          value={data.weeklyActive !== null ? formatNumber(data.weeklyActive) : "—"}
          sub={data.weeklyActiveGrowth !== null ? `${formatDelta(data.weeklyActiveGrowth)} week on week` : undefined}
        />
        <Stat label="Overdue content" value={<span className={cn(data.overdue > 0 && "text-danger")}>{formatNumber(data.overdue)}</span>} />
      </div>
      <div className="mt-4">
        <p className="mb-2 text-xs text-muted-foreground">Content pipeline</p>
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {CONTENT_PIPELINE.map((stage, i) => {
            const n = data.stageCount[stage] ?? 0;
            return n ? (
              <span
                key={stage}
                style={{ width: `${(n / total) * 100}%`, background: "var(--chart-1)", opacity: 0.3 + (0.7 * (i + 1)) / CONTENT_PIPELINE.length }}
                title={`${CONTENT_STAGE[stage].label}: ${n}`}
              />
            ) : null;
          })}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {CONTENT_PIPELINE.map((stage) => (
            <li key={stage}>
              {CONTENT_STAGE[stage].label} <span className="tabular font-medium text-foreground">{data.stageCount[stage] ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  );
}

export function TechnologyCard({ data }: { data: NonNullable<DashboardData["technology"]> }) {
  return (
    <SectionCard
      title="Product & technology"
      description="Platform health and delivery"
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/technology">Roadmap</Link>
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Open bugs" value={formatNumber(data.openBugs)} sub={`${data.critical} critical · ${data.high} high`} />
        <Stat label="Released this quarter" value={formatNumber(data.releasedThisQuarter)} />
        <Stat label="In progress" value={formatNumber(data.inProgress)} />
        <Stat label="In testing" value={formatNumber(data.testing)} />
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {(
          [
            ["Critical", data.critical, "danger"],
            ["High", data.high, "warning"],
            ["Medium", data.medium, "info"],
            ["Low", data.low, "neutral"],
          ] as const
        ).map(([label, n, tone]) => (
          <li key={label} className="flex items-center gap-3">
            <Badge tone={tone} className="w-16 justify-center">
              {label}
            </Badge>
            <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="absolute inset-y-0 left-0 rounded-full bg-chart-1" style={{ width: `${data.openBugs ? (n / data.openBugs) * 100 : 0}%` }} />
            </span>
            <span className="tabular w-6 text-right text-xs">{n}</span>
          </li>
        ))}
      </ul>
      <Link href="/technology/bugs" className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        Bug tracker <ArrowUpRightIcon className="size-3" />
      </Link>
    </SectionCard>
  );
}
