"use client";

import * as React from "react";
import { Loader2Icon, SaveIcon, CopyPlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { ScenarioType } from "@prisma/client";
import { deleteProjectionAction, saveProjectionAction } from "@/server/actions/finance";
import { ChartLegend, ChartTable, TimeSeriesChart } from "@/components/charts/chart-card";
import { ConfirmActionButton } from "@/components/forms/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addMonths, toDateInput } from "@/lib/dates";
import { formatMonthShort, formatNumber, formatZAR } from "@/lib/format";
import { SCENARIO } from "@/lib/labels";
import { runProjection, type ProjectionInputs } from "@/lib/projections";
import { cn } from "@/lib/utils";

export interface SavedScenario extends ProjectionInputs {
  id: string;
  name: string;
  scenario: ScenarioType;
  startMonth: string;
  notes: string | null;
  createdBy: string;
}

type Field = { key: keyof ProjectionInputs; label: string; unit: "count" | "zar" | "pct" | "months"; hint?: string };

const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: "Learners",
    fields: [
      { key: "startingLearners", label: "Paying learners today", unit: "count" },
      { key: "monthlyNewLearners", label: "New paying learners / month", unit: "count" },
      { key: "newLearnerGrowthRate", label: "Intake growth / month", unit: "pct" },
      { key: "monthlyChurnRate", label: "Monthly churn", unit: "pct" },
      { key: "avgSubscriptionPrice", label: "Average subscription price", unit: "zar", hint: "Per learner per month" },
    ],
  },
  {
    title: "Schools",
    fields: [
      { key: "schoolRevenueMonthly", label: "School revenue / month", unit: "zar" },
      { key: "schoolRevenueGrowthRate", label: "School revenue growth / month", unit: "pct" },
    ],
  },
  {
    title: "Costs",
    fields: [
      { key: "salariesMonthly", label: "Salaries / month", unit: "zar" },
      { key: "salaryGrowthRate", label: "Salary growth / month", unit: "pct" },
      { key: "marketingMonthly", label: "Marketing / month", unit: "zar" },
      { key: "technologyMonthly", label: "Technology / month", unit: "zar" },
      { key: "otherExpensesMonthly", label: "Other expenses / month", unit: "zar" },
    ],
  },
  {
    title: "Model",
    fields: [
      { key: "startingCash", label: "Starting cash", unit: "zar" },
      { key: "horizonMonths", label: "Horizon", unit: "months" },
    ],
  },
];

const PCT_KEYS = new Set<keyof ProjectionInputs>(["newLearnerGrowthRate", "monthlyChurnRate", "schoolRevenueGrowthRate", "salaryGrowthRate"]);

/** Display value (percent fields shown as e.g. "4.5" for 4.5%). */
function toDisplay(inputs: ProjectionInputs): Record<keyof ProjectionInputs, string> {
  return Object.fromEntries(
    (Object.keys(inputs) as (keyof ProjectionInputs)[]).map((k) => [k, PCT_KEYS.has(k) ? String(+(inputs[k] * 100).toFixed(2)) : String(inputs[k])]),
  ) as Record<keyof ProjectionInputs, string>;
}

function fromDisplay(display: Record<keyof ProjectionInputs, string>): ProjectionInputs {
  const out = {} as ProjectionInputs;
  for (const k of Object.keys(display) as (keyof ProjectionInputs)[]) {
    const n = Number(String(display[k]).replace(/[R\s,]/g, ""));
    out[k] = Number.isFinite(n) ? (PCT_KEYS.has(k) ? n / 100 : n) : 0;
  }
  return out;
}

export function ScenarioPlanner({ scenarios, canSave, baseline }: { scenarios: SavedScenario[]; canSave: boolean; baseline: { startingCash: number; startingLearners: number; schoolRevenueMonthly: number } }) {
  const [selectedId, setSelectedId] = React.useState(scenarios.find((s) => s.scenario === "BASE")?.id ?? scenarios[0]?.id ?? "new");
  const selected = scenarios.find((s) => s.id === selectedId);
  const template: SavedScenario =
    selected ??
    ({
      id: "",
      name: "New scenario",
      scenario: "CUSTOM",
      startMonth: toDateInput(addMonths(new Date(), 1)).slice(0, 8) + "01",
      notes: null,
      createdBy: "",
      horizonMonths: 18,
      startingLearners: baseline.startingLearners,
      monthlyNewLearners: 250,
      newLearnerGrowthRate: 0.02,
      monthlyChurnRate: 0.05,
      avgSubscriptionPrice: 159,
      schoolRevenueMonthly: baseline.schoolRevenueMonthly,
      schoolRevenueGrowthRate: 0.02,
      salariesMonthly: 400_000,
      salaryGrowthRate: 0.01,
      marketingMonthly: 45_000,
      technologyMonthly: 30_000,
      otherExpensesMonthly: 25_000,
      startingCash: baseline.startingCash,
    } satisfies SavedScenario);

  const [display, setDisplay] = React.useState(() => toDisplay(template));
  const [meta, setMeta] = React.useState({ name: template.name, scenario: template.scenario, startMonth: template.startMonth, notes: template.notes ?? "" });
  const [view, setView] = React.useState<"chart" | "table">("chart");
  const [state, formAction, pending] = React.useActionState(saveProjectionAction, null);
  const [saveAsNew, setSaveAsNew] = React.useState(false);

  const select = (id: string) => {
    setSelectedId(id);
    const next = scenarios.find((s) => s.id === id) ?? template;
    setDisplay(toDisplay(next));
    setMeta({ name: next.name, scenario: next.scenario, startMonth: next.startMonth, notes: next.notes ?? "" });
  };

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.message ?? "Saved");
    else toast.error(state.message ?? "Could not save the projection");
  }, [state]);

  const inputs = fromDisplay(display);
  const { months, summary } = runProjection(inputs);
  const start = new Date(`${meta.startMonth}T12:00:00Z`);
  const rows = months.map((m) => ({ ...m, label: formatMonthShort(addMonths(start, m.index)) + (m.index % 12 === 0 || m.index === 0 ? ` ${addMonths(start, m.index).getUTCFullYear().toString().slice(2)}` : "") }));

  // Comparison across saved scenarios (current edits replace the selected one).
  const comparison = rows.map((r) => ({ label: r.label }) as Record<string, string | number>);
  const compareSeries = scenarios.slice(0, 3).map((s, i) => {
    const run = s.id === selectedId ? months : runProjection(s).months;
    run.forEach((m, idx) => {
      if (comparison[idx]) comparison[idx][s.id] = m.cash;
    });
    return { key: s.id, label: SCENARIO[s.scenario].label, slot: (i + 1) as 1 | 2 | 3, type: "line" as const };
  });

  const tile = (label: string, value: React.ReactNode, tone?: "good" | "bad") => (
    <div className="rounded-lg bg-muted/60 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular text-lg font-semibold", tone === "good" && "text-success", tone === "bad" && "text-danger")}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => select(s.id)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              s.id === selectedId ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border bg-card hover:border-input",
            )}
          >
            <span className="flex items-center gap-2 font-medium">
              {s.name}
              <Badge tone={SCENARIO[s.scenario].tone}>{SCENARIO[s.scenario].label}</Badge>
            </span>
          </button>
        ))}
        {canSave && (
          <Button variant="outline" onClick={() => select("new")} className={cn(selectedId === "new" && "border-primary")}>
            <CopyPlusIcon /> New scenario
          </Button>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Assumptions</CardTitle>
              <CardDescription>Outputs update as you type. {canSave ? "Save to share with the team." : "You can explore, but not save, scenarios."}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-5">
              <input type="hidden" name="id" value={saveAsNew || selectedId === "new" ? "" : selectedId} />
              {(Object.keys(inputs) as (keyof ProjectionInputs)[]).map((k) => (
                <input key={k} type="hidden" name={k} value={display[k]} />
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="proj-name">Scenario name</Label>
                <Input id="proj-name" name="name" value={meta.name} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} disabled={!canSave} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="proj-scenario">Scenario type</Label>
                  <select
                    id="proj-scenario"
                    name="scenario"
                    value={meta.scenario}
                    onChange={(e) => setMeta((m) => ({ ...m, scenario: e.target.value as ScenarioType }))}
                    disabled={!canSave}
                    className="h-9 w-full rounded-lg border border-input bg-card px-2 text-sm"
                  >
                    {(Object.keys(SCENARIO) as ScenarioType[]).map((s) => (
                      <option key={s} value={s}>
                        {SCENARIO[s].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="proj-start">Start month</Label>
                  <Input id="proj-start" type="date" name="startMonth" value={meta.startMonth} onChange={(e) => setMeta((m) => ({ ...m, startMonth: e.target.value }))} disabled={!canSave} />
                </div>
              </div>
              {GROUPS.map((group) => (
                <fieldset key={group.title} className="space-y-3">
                  <legend className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{group.title}</legend>
                  {group.fields.map((f) => (
                    <div key={f.key} className="grid grid-cols-[1fr_140px] items-center gap-3">
                      <Label htmlFor={`proj-${f.key}`} className="text-[13px] font-normal text-muted-foreground">
                        {f.label}
                      </Label>
                      <div className="relative">
                        {f.unit === "zar" && <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-muted-foreground">R</span>}
                        <Input
                          id={`proj-${f.key}`}
                          inputMode="decimal"
                          value={display[f.key]}
                          onChange={(e) => setDisplay((d) => ({ ...d, [f.key]: e.target.value }))}
                          className={cn("tabular h-8 text-right text-[13px]", f.unit === "zar" && "pl-6", (f.unit === "pct" || f.unit === "months") && "pr-7")}
                        />
                        {f.unit === "pct" && <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">%</span>}
                        {f.unit === "months" && <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">mo</span>}
                      </div>
                    </div>
                  ))}
                </fieldset>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="proj-notes">Notes</Label>
                <Textarea id="proj-notes" name="notes" rows={2} value={meta.notes} onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))} disabled={!canSave} />
              </div>
              {canSave && (
                <div className="flex flex-wrap gap-2">
                  {selectedId !== "new" && (
                    <Button type="submit" disabled={pending} onClick={() => setSaveAsNew(false)}>
                      {pending && !saveAsNew ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save
                    </Button>
                  )}
                  <Button type="submit" variant={selectedId === "new" ? "default" : "outline"} disabled={pending} onClick={() => setSaveAsNew(true)}>
                    {pending && saveAsNew ? <Loader2Icon className="animate-spin" /> : <CopyPlusIcon />} Save as new
                  </Button>
                  {selected && (
                    <ConfirmActionButton variant="ghost" action={deleteProjectionAction} input={{ id: selected.id }} title="Delete this scenario?" description="The saved projection is removed for everyone." confirmLabel="Delete">
                      <Trash2Icon /> Delete
                    </ConfirmActionButton>
                  )}
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Projected outcome</CardTitle>
                <CardDescription>
                  {inputs.horizonMonths} months from {formatMonthShort(start)} {start.getUTCFullYear()} {selected ? `· saved by ${selected.createdBy}` : ""}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {tile("Paying learners at end", formatNumber(summary.endingLearners))}
                {tile("Monthly revenue at end", formatZAR(summary.endingMonthlyRevenue))}
                {tile("Total net profit", formatZAR(summary.totalNetProfit), summary.totalNetProfit >= 0 ? "good" : "bad")}
                {tile("Ending cash", formatZAR(summary.endingCash), summary.endingCash >= 0 ? undefined : "bad")}
                {tile("Break-even", summary.breakEvenMonth ? `Month ${summary.breakEvenMonth} (${formatMonthShort(addMonths(start, summary.breakEvenMonth - 1))})` : "Not within horizon", summary.breakEvenMonth ? "good" : undefined)}
                {tile("Cash runs out", summary.cashOutMonth ? `Month ${summary.cashOutMonth}` : "Not within horizon", summary.cashOutMonth ? "bad" : "good")}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-wrap">
              <div>
                <CardTitle>Revenue, expenses and profit</CardTitle>
                <CardDescription>Monthly</CardDescription>
              </div>
              <div className="flex rounded-lg bg-muted p-0.5 text-xs">
                {(["chart", "table"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cn("rounded-md px-2.5 py-1 capitalize text-muted-foreground", view === v && "bg-card text-foreground shadow-sm")}>
                    {v}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {view === "chart" ? (
                <>
                  <ChartLegend
                    series={[
                      { key: "revenue", label: "Revenue", slot: 1, type: "bar" },
                      { key: "expenses", label: "Expenses", slot: 2, type: "bar" },
                      { key: "netProfit", label: "Net profit", slot: 3, type: "line" },
                    ]}
                  />
                  <TimeSeriesChart
                    data={rows}
                    format="zar"
                    height={280}
                    series={[
                      { key: "revenue", label: "Revenue", slot: 1, type: "bar" },
                      { key: "expenses", label: "Expenses", slot: 2, type: "bar" },
                      { key: "netProfit", label: "Net profit", slot: 3, type: "line" },
                    ]}
                  />
                </>
              ) : (
                <ChartTable
                  data={rows}
                  format="zar"
                  xLabel="Month"
                  series={[
                    { key: "learners", label: "Learners", slot: 1, type: "line", format: "number" },
                    { key: "revenue", label: "Revenue", slot: 1, type: "bar" },
                    { key: "expenses", label: "Expenses", slot: 2, type: "bar" },
                    { key: "netProfit", label: "Net profit", slot: 3, type: "line" },
                    { key: "cash", label: "Cash", slot: 4, type: "line" },
                  ]}
                />
              )}
            </CardContent>
          </Card>

          {compareSeries.length > 1 && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Cash balance by scenario</CardTitle>
                  <CardDescription>Conservative vs base vs aggressive (your unsaved edits apply to the selected scenario)</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ChartLegend series={compareSeries} />
                <TimeSeriesChart data={comparison} series={compareSeries} format="zar" height={240} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
