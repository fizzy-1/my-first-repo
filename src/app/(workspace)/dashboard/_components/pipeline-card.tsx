import Link from "next/link";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { formatNumber, formatZAR } from "@/lib/format";
import type { DashboardData } from "./types";

const LABELS: Record<string, string> = {
  PROSPECT: "Lead",
  CONTACTED: "Contacted",
  MEETING: "Meeting",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
};

/** Lead → Contacted → Meeting → Proposal → Negotiation → Won → Lost, with counts and estimated annual value. */
export function PipelineCard({ data }: { data: NonNullable<DashboardData["schools"]> }) {
  const byStage = new Map(data.pipeline.map((s) => [s.stage, s]));
  const won = ["PARTNERSHIP", "ACTIVE"].map((s) => byStage.get(s as never)!).filter(Boolean);
  const rows = [
    ...(["PROSPECT", "CONTACTED", "MEETING", "PROPOSAL", "NEGOTIATION"] as const).map((stage) => ({
      key: stage,
      count: byStage.get(stage)?.count ?? 0,
      value: byStage.get(stage)?.value ?? 0,
      weighted: byStage.get(stage)?.weighted ?? 0,
    })),
    { key: "WON", count: won.reduce((s, x) => s + x.count, 0), value: won.reduce((s, x) => s + x.value, 0), weighted: won.reduce((s, x) => s + x.value, 0) },
    { key: "LOST", count: byStage.get("LOST")?.count ?? 0, value: byStage.get("LOST")?.value ?? 0, weighted: 0 },
  ];
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <SectionCard
      title="Business pipeline"
      description="School partnership pipeline · count and estimated annual value per stage"
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/schools?view=board">Open pipeline</Link>
        </Button>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/60 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Open pipeline value</p>
          <p className="tabular text-lg font-semibold">{formatZAR(data.openPipelineValue)}</p>
        </div>
        <div className="rounded-lg bg-muted/60 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Probability-weighted</p>
          <p className="tabular text-lg font-semibold">{formatZAR(data.weightedPipelineValue)}</p>
        </div>
      </div>
      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li key={row.key} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 text-sm">
            <span className="text-muted-foreground">{LABELS[row.key]}</span>
            <span className="relative h-6 overflow-hidden rounded-md bg-muted/60" title={`${row.count} schools`}>
              <span
                className="absolute inset-y-0 left-0 rounded-md"
                style={{
                  width: `${Math.max(row.count ? 4 : 0, (row.count / max) * 100)}%`,
                  background: row.key === "LOST" ? "var(--chart-axis)" : row.key === "WON" ? "var(--chart-3)" : "var(--chart-1)",
                  opacity: row.key === "WON" || row.key === "LOST" ? 1 : 0.55 + (0.45 * (["PROSPECT", "CONTACTED", "MEETING", "PROPOSAL", "NEGOTIATION"].indexOf(row.key) + 1)) / 5,
                }}
              />
              <span className="tabular relative flex h-full items-center px-2 text-xs font-medium">{formatNumber(row.count)}</span>
            </span>
            <span className="tabular w-24 text-right text-xs text-muted-foreground">{formatZAR(row.value, { compact: true })}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
