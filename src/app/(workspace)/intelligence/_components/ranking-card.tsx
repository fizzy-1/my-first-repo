"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart3Icon, TableIcon } from "lucide-react";
import { formatValue, type ValueFormat } from "@/components/charts/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface RankingItem {
  key: string;
  label: string;
  /** The ranked measure (bar length). */
  value: number;
  /** Short secondary text beside the value, e.g. "62% from previous stage". */
  note?: string;
  href?: string;
  /** Extra measures for the table view, keyed by `columns[].key`. */
  [measure: string]: string | number | null | undefined;
}

export interface RankingColumn {
  key: string;
  label: string;
  format: ValueFormat;
}

/**
 * Horizontal-bar ranking with the same card anatomy as ChartCard (title,
 * headline, chart ↔ table toggle). One measure in one categorical hue — bars
 * differ by length, never colour — with every bar direct-labelled. Items are
 * ranked by value unless `ordered` (e.g. funnel stages keep their order).
 */
export function RankingCard({
  title,
  description,
  headline,
  items,
  measure,
  columns = [],
  category,
  ordered = false,
  slot = 1,
  className,
  emptyMessage = "No data for this period.",
}: {
  title: string;
  description?: string;
  headline?: React.ReactNode;
  items: RankingItem[];
  measure: RankingColumn;
  columns?: RankingColumn[];
  /** Header of the category column in the table view. */
  category: string;
  ordered?: boolean;
  slot?: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
  emptyMessage?: string;
}) {
  const [view, setView] = React.useState<"chart" | "table">("chart");
  const rows = ordered ? items : [...items].sort((a, b) => b.value - a.value);
  const max = Math.max(0, ...rows.map((r) => r.value));
  const hasData = max > 0;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <div className="min-w-0 flex-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
          {headline && <div className="mt-2">{headline}</div>}
        </div>
        <div className="flex shrink-0 rounded-lg bg-muted p-0.5" role="group" aria-label="Chart view">
          <button
            type="button"
            onClick={() => setView("chart")}
            aria-pressed={view === "chart"}
            className={cn("rounded-md p-1.5 text-muted-foreground transition-colors", view === "chart" && "bg-card text-foreground shadow-sm")}
            aria-label="Show chart"
          >
            <BarChart3Icon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            aria-pressed={view === "table"}
            className={cn("rounded-md p-1.5 text-muted-foreground transition-colors", view === "table" && "bg-card text-foreground shadow-sm")}
            aria-label="Show data table"
          >
            <TableIcon className="size-3.5" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {!hasData ? (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : view === "chart" ? (
          <ul className="space-y-3" aria-label={`${title}: ${measure.label}`}>
            {rows.map((row) => {
              const value = formatValue(row.value, measure.format);
              return (
                <li key={row.key} title={`${row.label}: ${value}${row.note ? ` · ${row.note}` : ""}`}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    {row.href ? (
                      <Link href={row.href} className="min-w-0 truncate hover:underline">
                        {row.label}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate">{row.label}</span>
                    )}
                    <span className="flex shrink-0 items-baseline gap-2">
                      {row.note && <span className="text-xs text-muted-foreground">{row.note}</span>}
                      <span className="tabular font-medium">{value}</span>
                    </span>
                  </div>
                  <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${row.value > 0 ? Math.max(1.5, (row.value / max) * 100) : 0}%`, background: `var(--chart-${slot})` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{category}</TableHead>
                  {[measure, ...columns].map((c) => (
                    <TableHead key={c.key} className="text-right">
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="text-muted-foreground">{row.label}</TableCell>
                    <TableCell className="tabular text-right">{formatValue(row.value, measure.format)}</TableCell>
                    {columns.map((c) => {
                      const v = row[c.key];
                      return (
                        <TableCell key={c.key} className="tabular text-right">
                          {formatValue(typeof v === "number" ? v : null, c.format)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
