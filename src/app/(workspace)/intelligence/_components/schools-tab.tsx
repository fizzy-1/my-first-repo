import Link from "next/link";
import { CalendarClockIcon, FileSignatureIcon, HandshakeIcon, PercentIcon, SchoolIcon, TargetIcon, XCircleIcon } from "lucide-react";
import { schoolIntelligence } from "@/server/services/intelligence";
import { ChartCard } from "@/components/charts/chart-card";
import { EmptyState } from "@/components/common/empty-state";
import { KpiCard } from "@/components/common/kpi-card";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PARTNERSHIP_STATUS } from "@/lib/labels";
import { formatDate, formatNumber, formatPercent, formatZAR } from "@/lib/format";
import { RankingCard } from "./ranking-card";
import { ChartGrid, Headline, RestrictedNote, RestrictedTab, StatGrid, type TabContext } from "./shared";

export async function SchoolsTab({ ctx }: { ctx: TabContext }) {
  if (!ctx.access.schools) {
    return <RestrictedTab title="Requires schools access" description="School pipeline and partnership metrics are available to roles with access to the Schools CRM." />;
  }
  const data = await schoolIntelligence(ctx.user, ctx.window);
  const renewalValue = data.renewals.reduce((s, r) => s + r.annualValue, 0);
  const invoicedTotal = data.invoiced?.reduce((s, r) => s + r.school, 0) ?? 0;

  return (
    <div className="space-y-6">
      <StatGrid className="xl:grid-cols-3">
        <KpiCard
          label={`Schools won · last ${ctx.periodLabel}`}
          icon={HandshakeIcon}
          value={formatNumber(data.won.value)}
          delta={data.won.delta}
          deltaLabel={ctx.vsPrevious}
          details={[
            { label: "Previous period", value: formatNumber(data.won.previous) },
            { label: "Counted at", value: "First partnership signed" },
          ]}
        />
        <KpiCard
          label={`Schools lost · last ${ctx.periodLabel}`}
          icon={XCircleIcon}
          value={formatNumber(data.lost.value)}
          delta={data.lost.delta}
          deltaLabel={ctx.vsPrevious}
          upIsGood={false}
          details={[{ label: "Previous period", value: formatNumber(data.lost.previous) }]}
        />
        <KpiCard
          label="Win rate"
          icon={PercentIcon}
          value={formatPercent(data.winRate, 0)}
          details={[
            { label: "Won ÷ closed", value: `${formatNumber(data.won.value)} of ${formatNumber(data.won.value + data.lost.value)}` },
            { label: "Period", value: `Last ${ctx.periodLabel}` },
          ]}
        />
        <KpiCard
          label="Open pipeline value"
          icon={TargetIcon}
          value={formatZAR(data.openPipelineValue, { compact: data.openPipelineValue >= 1_000_000 })}
          href="/schools?view=board"
          details={[
            { label: "Probability-weighted", value: formatZAR(data.weightedPipelineValue, { compact: true }) },
            { label: "Open prospects", value: formatNumber(data.prospects) },
          ]}
        />
        <KpiCard
          label="Active partnerships"
          icon={SchoolIcon}
          value={formatNumber(data.activePartnerships.value)}
          delta={data.activePartnerships.delta}
          deltaLabel="vs one month ago"
          href="/schools?stage=ACTIVE"
          details={[{ label: "One month ago", value: formatNumber(data.activePartnerships.previous) }]}
        />
        <KpiCard
          label="Contracted partnership MRR"
          icon={FileSignatureIcon}
          value={formatZAR(data.contractedNow)}
          details={[
            { label: "Annualised", value: formatZAR(data.contractedNow * 12, { compact: true }) },
            { label: "Basis", value: "Signed & active contracts" },
          ]}
        />
      </StatGrid>

      <ChartGrid>
        <RankingCard
          title="Pipeline conversion"
          description={`Schools that reached each stage (at it now or further along) and the share that moved on from the stage before. ${formatNumber(data.lostTotal.count)} lost schools are excluded because the stage they were lost at isn't recorded.`}
          category="Stage"
          ordered
          measure={{ key: "reached", label: "Reached stage", format: "number" }}
          columns={[
            { key: "current", label: "At stage now", format: "number" },
            { key: "conversion", label: "From previous stage", format: "percent" },
            { key: "pipelineValue", label: "Annual value", format: "zar" },
            { key: "weighted", label: "Weighted value", format: "zar" },
          ]}
          items={data.funnel.map((s) => ({
            key: s.key,
            label: s.label,
            value: s.reached,
            note: s.conversion === null ? undefined : `${formatPercent(s.conversion, 0)} of previous`,
            href: s.key === "WON" ? undefined : `/schools?stage=${s.key}`,
            current: s.current,
            conversion: s.conversion,
            pipelineValue: s.value,
            weighted: s.weighted,
          }))}
        />
        <ChartCard
          title="Schools won vs lost"
          description={`${ctx.bucketLabel} first partnerships signed and schools marked lost`}
          headline={<Headline value={formatPercent(data.winRate, 0)} caption="win rate" />}
          data={data.outcomes}
          series={[
            { key: "won", label: "Won", slot: 1, type: "bar" },
            { key: "lost", label: "Lost", slot: 2, type: "bar" },
          ]}
        />
        <ChartCard
          title="Contracted partnership MRR"
          description="Monthly value of school contracts live at the end of each period"
          headline={<Headline value={formatZAR(data.contractedNow)} caption="per month" />}
          data={data.contracted}
          format="zar"
          series={[{ key: "mrr", label: "Contracted MRR", slot: 2, type: "area" }]}
        />
        {data.invoiced ? (
          <ChartCard
            title="Invoiced partnership revenue"
            description={`${ctx.bucketLabel} school-contract income invoiced`}
            headline={<Headline value={formatZAR(invoicedTotal)} caption={`last ${ctx.periodLabel}`} />}
            data={data.invoiced}
            format="zar"
            series={[{ key: "school", label: "School contracts", slot: 2, type: "bar" }]}
          />
        ) : (
          <RestrictedNote className="self-start">Invoiced partnership revenue requires finance access.</RestrictedNote>
        )}
      </ChartGrid>

      <SectionCard
        title="Upcoming renewals"
        description={
          data.renewals.length
            ? `${data.renewals.length} contract${data.renewals.length === 1 ? "" : "s"} ending in the next 90 days · ${formatZAR(renewalValue)} a year`
            : "Contracts ending in the next 90 days"
        }
        flush
      >
        {data.renewals.length === 0 ? (
          <EmptyState icon={CalendarClockIcon} title="No renewals due" description="No signed or active partnership ends in the next 90 days." compact />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>School</TableHead>
                <TableHead className="hidden md:table-cell">Owner</TableHead>
                <TableHead>Ends</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Learners</TableHead>
                <TableHead className="text-right">Annual value</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.renewals.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-48 truncate font-medium">
                    <Link href={`/schools/${r.schoolId}`} className="hover:underline">
                      {r.school}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{r.owner ?? "Unassigned"}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(r.endDate)}</TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{formatNumber(r.learnersCovered)}</TableCell>
                  <TableCell className="tabular text-right">{formatZAR(r.annualValue)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <StatusBadge meta={PARTNERSHIP_STATUS} value={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
