"use client";

import * as React from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { BarChart3Icon, TableIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatValue, type ValueFormat } from "./format";

export interface SeriesDef {
  key: string;
  label: string;
  /** Categorical slot 1–6 (fixed order; colour follows the entity, never its rank). */
  slot: 1 | 2 | 3 | 4 | 5 | 6;
  type: "bar" | "line" | "area";
  stackId?: string;
  /** Overrides the chart-level value format for this series (tables / tooltips). */
  format?: ValueFormat;
}

export type ChartRow = Record<string, string | number | null>;
/** Any array of plain row objects (interfaces lack index signatures, so accept `object`). */
type Rows = readonly object[];
const rowsOf = (data: Rows) => data as ChartRow[];

const color = (slot: SeriesDef["slot"]) => `var(--chart-${slot})`;

function LegendKey({ series }: { series: SeriesDef }) {
  return series.type === "bar" ? (
    <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color(series.slot) }} />
  ) : (
    <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: color(series.slot) }} />
  );
}

export function ChartLegend({ series }: { series: SeriesDef[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <LegendKey series={s} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
  format,
  showTotal,
}: TooltipContentProps<number, string> & { series: SeriesDef[]; format: ValueFormat; showTotal: boolean }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartRow | undefined;
  if (!row) return null;
  const total = series.reduce((s, def) => s + (Number(row[def.key]) || 0), 0);
  return (
    <div className="min-w-44 rounded-lg border border-border bg-popover px-3 py-2.5 text-xs shadow-xl">
      <p className="mb-1.5 font-medium text-muted-foreground">{label}</p>
      <ul className="space-y-1">
        {[...series].reverse().map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-2.5 shrink-0 rounded-full" style={{ background: color(s.slot) }} />
            <span className="tabular font-semibold text-foreground">{formatValue(Number(row[s.key]) || 0, s.format ?? format)}</span>
            <span className="text-muted-foreground">{s.label}</span>
          </li>
        ))}
      </ul>
      {showTotal && series.length > 1 && (
        <p className="mt-1.5 flex items-center gap-2 border-t border-border pt-1.5">
          <span className="tabular font-semibold text-foreground">{formatValue(total, format)}</span>
          <span className="text-muted-foreground">Total</span>
        </p>
      )}
    </div>
  );
}

/**
 * Time-series chart with legend, tooltip (all series at the hovered X) and a
 * table view. Bars ≤24px with 4px rounded data-ends; 2px lines; hairline grid;
 * a single y-axis (mixed-scale measures belong in separate charts).
 */
export function TimeSeriesChart({
  data,
  series,
  format = "number",
  height = 260,
  xKey = "label",
  showTotal,
}: {
  data: Rows;
  series: SeriesDef[];
  format?: ValueFormat;
  height?: number;
  xKey?: string;
  showTotal?: boolean;
}) {
  const stacked = series.some((s) => s.stackId);
  const lastInStack = new Map<string, string>();
  for (const s of series) if (s.type === "bar" && s.stackId) lastInStack.set(s.stackId, s.key);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rowsOf(data)} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-axis)" }}
            tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={18}
            tickMargin={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
            tickFormatter={(v: number) => formatValue(v, format, true)}
            width={56}
            allowDecimals={false}
          />
          <Tooltip
            cursor={stacked || series.some((s) => s.type === "bar") ? { fill: "var(--accent)", opacity: 0.5 } : { stroke: "var(--chart-axis)", strokeWidth: 1 }}
            content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} series={series} format={format} showTotal={showTotal ?? stacked} />}
          />
          {series.map((s) => {
            if (s.type === "bar") {
              const isTop = !s.stackId || lastInStack.get(s.stackId) === s.key;
              return (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId={s.stackId}
                  fill={color(s.slot)}
                  maxBarSize={24}
                  radius={isTop ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  stroke="var(--card)"
                  strokeWidth={s.stackId ? 1 : 0}
                  isAnimationActive={false}
                />
              );
            }
            if (s.type === "area") {
              return (
                <Area
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type="monotone"
                  stroke={color(s.slot)}
                  strokeWidth={2}
                  fill={color(s.slot)}
                  fillOpacity={0.1}
                  dot={false}
                  activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              );
            }
            return (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                type="monotone"
                stroke={color(s.slot)}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartTable({ data, series, format, xKey = "label", xLabel = "Period" }: { data: Rows; series: SeriesDef[]; format: ValueFormat; xKey?: string; xLabel?: string }) {
  return (
    <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{xLabel}</TableHead>
            {series.map((s) => (
              <TableHead key={s.key} className="text-right">
                {s.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rowsOf(data).map((row, i) => (
            <TableRow key={`${row[xKey]}-${i}`}>
              <TableCell className="text-muted-foreground">{row[xKey]}</TableCell>
              {series.map((s) => (
                <TableCell key={s.key} className="tabular text-right">
                  {formatValue(row[s.key] === null || row[s.key] === undefined ? null : Number(row[s.key]) || 0, s.format ?? format)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Card wrapper: title, legend, optional headline, chart ↔ table toggle. */
export function ChartCard({
  title,
  description,
  headline,
  actions,
  data,
  series,
  format = "number",
  height,
  showTotal,
  className,
  emptyMessage = "No data for this period.",
}: {
  title: string;
  description?: string;
  headline?: React.ReactNode;
  actions?: React.ReactNode;
  data: Rows;
  series: SeriesDef[];
  format?: ValueFormat;
  height?: number;
  showTotal?: boolean;
  className?: string;
  emptyMessage?: string;
}) {
  const [view, setView] = React.useState<"chart" | "table">("chart");
  const hasData = rowsOf(data).some((row) => series.some((s) => Number(row[s.key]) !== 0 && row[s.key] !== null));
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex-wrap">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
          {headline && <div className="mt-2">{headline}</div>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label="Chart view">
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
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <ChartLegend series={series} />
        {!hasData ? (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : view === "chart" ? (
          <TimeSeriesChart data={data} series={series} format={format} height={height} showTotal={showTotal} />
        ) : (
          <ChartTable data={data} series={series} format={format} />
        )}
      </CardContent>
    </Card>
  );
}
