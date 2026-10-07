import Link from "next/link";
import {
  AlertOctagonIcon,
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ClockAlertIcon,
  InfoIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CALENDAR_KINDS } from "@/server/services/calendar";
import { APPROVAL_TYPE } from "@/lib/labels";
import { formatDate, formatRelative, formatShortDate, formatTime, formatWeekdayShort, formatZAR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardData } from "./types";

function Panel({
  title,
  icon: Icon,
  count,
  href,
  tone,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  href?: string;
  tone: "warning" | "danger" | "primary" | "info";
  children: React.ReactNode;
}) {
  const toneClass = { warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", primary: "bg-primary-soft text-primary-soft-foreground", info: "bg-info-soft text-info" }[tone];
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("flex size-7 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="size-4" />
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        {count !== undefined && <span className="tabular rounded-full bg-muted px-2 text-xs leading-5 text-muted-foreground">{count}</span>}
        {href && (
          <Link href={href} className="ml-auto inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
            View all <ChevronRightIcon className="size-3.5" />
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
      <CheckCircle2Icon className="size-4 text-success" /> {text}
    </p>
  );
}

const ISSUE_ICON = { critical: AlertOctagonIcon, high: AlertTriangleIcon, warning: InfoIcon };
const ISSUE_TONE = { critical: "text-danger", high: "text-warning", warning: "text-muted-foreground" };

export function ActionCentre({ data }: { data: DashboardData }) {
  const { approvals, overdue, deadlines, issues } = data;
  return (
    <Card className="p-5">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Executive action centre</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">What needs a decision or intervention now.</p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Pending approvals" icon={ShieldAlertIcon} count={approvals.total} href="/approvals" tone="warning">
          {approvals.rows.length === 0 ? (
            <Empty text="No pending approvals." />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {approvals.rows.map((a) => (
                <li key={a.id}>
                  <Link href={`/approvals/${a.id}`} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-subtle">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {APPROVAL_TYPE[a.type].label} · {a.requester.name} · {formatRelative(a.createdAt)}
                      </p>
                    </div>
                    {a.amount !== null && <span className="tabular text-sm font-medium">{formatZAR(a.amount)}</span>}
                    {(a.priority === "HIGH" || a.priority === "CRITICAL") && <Badge tone={a.priority === "CRITICAL" ? "danger" : "warning"}>{a.priority === "CRITICAL" ? "Critical" : "High"}</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Overdue tasks" icon={ClockAlertIcon} count={overdue.total} href="/tasks?scope=all&overdue=1" tone="danger">
          {overdue.rows.length === 0 ? (
            <Empty text="Nothing overdue." />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {overdue.rows.map((t) => (
                <li key={t.id}>
                  <Link href={`/tasks/${t.id}`} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-subtle">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        #{t.number} · {t.assignee?.name ?? "Unassigned"}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-danger">
                      <AlertTriangleIcon className="size-3.5" /> {formatDate(t.dueDate)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Important deadlines" icon={CalendarClockIcon} count={deadlines.length} href="/calendar?view=agenda" tone="primary">
          {deadlines.length === 0 ? (
            <Empty text="No deadlines in the next 14 days." />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {deadlines.slice(0, 6).map((e) => (
                <li key={e.id}>
                  <Link href={e.href} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-subtle">
                    <div className="w-14 shrink-0 text-center">
                      <p className="text-[11px] text-muted-foreground uppercase">{formatWeekdayShort(e.at)}</p>
                      <p className="tabular text-sm font-semibold">{formatShortDate(e.at)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {CALENDAR_KINDS[e.kind].label}
                        {!e.allDay && ` · ${formatTime(e.at)}`}
                        {e.subtitle && ` · ${e.subtitle}`}
                      </p>
                    </div>
                    {e.urgent && <Badge tone="danger">Urgent</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Critical issues" icon={AlertOctagonIcon} count={issues.length} tone="danger">
          {issues.length === 0 ? (
            <Empty text="No critical issues detected." />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {issues.slice(0, 6).map((issue) => {
                const Icon = ISSUE_ICON[issue.severity];
                return (
                  <li key={issue.id}>
                    <Link href={issue.href} className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-subtle">
                      <Icon className={cn("mt-0.5 size-4 shrink-0", ISSUE_TONE[issue.severity])} aria-label={issue.severity} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{issue.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {issue.area} · {issue.detail}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </Card>
  );
}
