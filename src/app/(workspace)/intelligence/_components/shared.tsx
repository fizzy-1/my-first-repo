import * as React from "react";
import { LockIcon } from "lucide-react";
import type { SessionUser } from "@/server/auth/current-user";
import type { IntelligenceAccess } from "@/server/services/intelligence";
import { EmptyState } from "@/components/common/empty-state";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DateWindow, RangeKey } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Everything a tab needs to load and label its period. */
export interface TabContext {
  user: SessionUser;
  /** Which module figures the user may see (enforced again by each service call). */
  access: IntelligenceAccess;
  window: DateWindow;
  range: RangeKey;
  /** "12 months", "30 days", … */
  periodLabel: string;
  /** "Monthly", "Weekly" or "Daily" — the bucket size of every trend chart. */
  bucketLabel: string;
  /** Delta caption for flow totals (compared with the equally long period before). */
  vsPrevious: string;
  /** Delta caption for stock figures (compared with their value when the period started). */
  vsStart: string;
  /** Link to another tab, keeping the selected period. */
  tabHref: (tab: string) => string;
}

/** Shown in place of a whole tab the user's role cannot see. */
export function RestrictedTab({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <EmptyState icon={LockIcon} title={title} description={description} />
    </Card>
  );
}

/** Shown in place of a section within a tab (e.g. finance figures for a non-finance role). */
export function RestrictedNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-[13px] text-muted-foreground", className)}>
      <LockIcon className="size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}

export function ChartGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-6 lg:grid-cols-2", className)}>{children}</div>;
}

export function TabSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

/** Headline figure above a chart. */
export function Headline({ value, caption }: { value: React.ReactNode; caption?: React.ReactNode }) {
  return (
    <p className="tabular text-2xl font-semibold tracking-tight">
      {value}
      {caption && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{caption}</span>}
    </p>
  );
}
