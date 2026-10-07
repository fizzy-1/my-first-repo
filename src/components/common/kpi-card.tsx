import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDelta } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Stat tile: label · value · signed delta vs a named period · supporting lines.
 * Delta colour = direction × whether "up" is good for this metric, and always
 * carries an arrow icon so meaning never relies on colour alone.
 */
export function KpiCard({
  label,
  value,
  delta,
  deltaLabel = "vs last month",
  upIsGood = true,
  icon: Icon,
  details,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  upIsGood?: boolean;
  icon?: LucideIcon;
  details?: { label: string; value: React.ReactNode }[];
  href?: string;
  className?: string;
}) {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  const direction = !hasDelta || Math.abs(delta) < 0.05 ? "flat" : delta > 0 ? "up" : "down";
  const good = direction === "flat" ? null : (direction === "up") === upIsGood;
  const DeltaIcon = direction === "up" ? ArrowUpRightIcon : direction === "down" ? ArrowDownRightIcon : MinusIcon;

  const body = (
    <Card className={cn("group flex h-full flex-col gap-3 p-5 transition-colors", href && "hover:border-primary/40", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[26px] leading-none font-semibold tracking-tight">{value}</span>
        {hasDelta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
              good === null && "bg-muted text-muted-foreground",
              good === true && "bg-success-soft text-success",
              good === false && "bg-danger-soft text-danger",
            )}
            title={deltaLabel}
          >
            <DeltaIcon className="size-3" aria-hidden />
            {formatDelta(delta)}
          </span>
        )}
      </div>
      {hasDelta && <p className="-mt-1.5 text-[11px] text-muted-foreground">{deltaLabel}</p>}
      {details && details.length > 0 && (
        <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border pt-3 text-xs">
          {details.map((d) => (
            <div key={d.label} className="flex min-w-0 flex-col">
              <dt className="truncate text-muted-foreground">{d.label}</dt>
              <dd className="tabular truncate font-medium">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
        {body}
      </Link>
    );
  }
  return body;
}
