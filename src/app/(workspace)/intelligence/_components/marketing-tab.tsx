import Link from "next/link";
import { BadgeCheckIcon, CoinsIcon, MegaphoneIcon, PercentIcon, ReceiptIcon, UserPlusIcon } from "lucide-react";
import { marketingIntelligence } from "@/server/services/intelligence";
import { ChartCard } from "@/components/charts/chart-card";
import { EmptyState } from "@/components/common/empty-state";
import { KpiCard } from "@/components/common/kpi-card";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CAMPAIGN_CHANNEL, CAMPAIGN_STATUS } from "@/lib/labels";
import { formatNumber, formatPercent, formatZAR } from "@/lib/format";
import { isDefined, percentChange } from "@/lib/utils";
import { RankingCard } from "./ranking-card";
import { ChartGrid, Headline, RestrictedTab, StatGrid, type TabContext } from "./shared";

const zarCents = (n: number | null) => formatZAR(n, { cents: true });

export async function MarketingTab({ ctx }: { ctx: TabContext }) {
  if (!ctx.access.marketing) {
    return <RestrictedTab title="Requires marketing access" description="Company-wide campaign performance is available to roles that can see every campaign." />;
  }
  const data = await marketingIntelligence(ctx.user, ctx.window);
  const bucket = data.granularity === "week" ? "Weekly" : ctx.bucketLabel;
  const channelCost = (key: "costPerLead" | "costPerConversion") =>
    data.byChannel.filter((c) => isDefined(c[key])).map((c) => ({ key: c.key, label: c.label, value: c[key] as number, href: `/marketing?channel=${c.key}` }));

  return (
    <div className="space-y-6">
      <StatGrid className="xl:grid-cols-3">
        <KpiCard
          label={`Spend · last ${ctx.periodLabel}`}
          icon={CoinsIcon}
          value={formatZAR(data.spend.value)}
          delta={data.spend.delta}
          deltaLabel={ctx.vsPrevious}
          upIsGood={false}
          details={[
            { label: "Previous period", value: formatZAR(data.spend.previous) },
            { label: "Attributed revenue", value: formatZAR(data.revenue) },
          ]}
        />
        <KpiCard
          label={`Leads · last ${ctx.periodLabel}`}
          icon={UserPlusIcon}
          value={formatNumber(data.leads.value)}
          delta={data.leads.delta}
          deltaLabel={ctx.vsPrevious}
          details={[{ label: "Previous period", value: formatNumber(data.leads.previous) }]}
        />
        <KpiCard
          label={`Conversions · last ${ctx.periodLabel}`}
          icon={BadgeCheckIcon}
          value={formatNumber(data.conversions.value)}
          delta={data.conversions.delta}
          deltaLabel={ctx.vsPrevious}
          details={[{ label: "Previous period", value: formatNumber(data.conversions.previous) }]}
        />
        <KpiCard
          label="Cost per lead"
          icon={ReceiptIcon}
          value={zarCents(data.costPerLead?.value ?? null)}
          delta={data.costPerLead?.delta}
          deltaLabel={ctx.vsPrevious}
          upIsGood={false}
          details={[{ label: "Previous period", value: zarCents(data.costPerLead?.previous ?? null) }]}
        />
        <KpiCard
          label="Cost per conversion"
          icon={MegaphoneIcon}
          value={zarCents(data.costPerConversion?.value ?? null)}
          delta={data.costPerConversion?.delta}
          deltaLabel={ctx.vsPrevious}
          upIsGood={false}
          details={[{ label: "Previous period", value: zarCents(data.costPerConversion?.previous ?? null) }]}
        />
        <KpiCard
          label="Lead-to-conversion rate"
          icon={PercentIcon}
          value={formatPercent(data.conversionRate)}
          delta={data.conversionRate !== null && data.previousConversionRate !== null ? percentChange(data.conversionRate, data.previousConversionRate) : null}
          deltaLabel={ctx.vsPrevious}
          details={[{ label: "Previous period", value: formatPercent(data.previousConversionRate) }]}
        />
      </StatGrid>

      <ChartGrid>
        <ChartCard
          title="Marketing spend"
          description={`${bucket} spend across all campaigns · last ${ctx.periodLabel}`}
          headline={<Headline value={formatZAR(data.spend.value)} caption={`last ${ctx.periodLabel}`} />}
          data={data.trend}
          format="zar"
          series={[{ key: "spend", label: "Spend", slot: 1, type: "bar" }]}
        />
        <ChartCard
          title="Leads and conversions"
          description={`${bucket} leads generated and leads converted to paying learners`}
          data={data.trend}
          series={[
            { key: "leads", label: "Leads", slot: 1, type: "bar" },
            { key: "conversions", label: "Conversions", slot: 2, type: "bar" },
          ]}
        />
        <ChartCard
          title="Cost per lead"
          description={`${bucket} spend ÷ leads`}
          headline={<Headline value={zarCents(data.costPerLead?.value ?? null)} caption="this period" />}
          data={data.trend}
          format="zar"
          height={220}
          series={[{ key: "costPerLead", label: "Cost per lead", slot: 1, type: "line" }]}
        />
        <ChartCard
          title="Cost per conversion"
          description={`${bucket} spend ÷ conversions`}
          headline={<Headline value={zarCents(data.costPerConversion?.value ?? null)} caption="this period" />}
          data={data.trend}
          format="zar"
          height={220}
          series={[{ key: "costPerConversion", label: "Cost per conversion", slot: 1, type: "line" }]}
        />
        <RankingCard
          title="Spend by channel"
          description={`Campaign spend per channel · last ${ctx.periodLabel}`}
          category="Channel"
          measure={{ key: "spend", label: "Spend", format: "zar" }}
          columns={[
            { key: "leads", label: "Leads", format: "number" },
            { key: "conversions", label: "Conversions", format: "number" },
          ]}
          items={data.byChannel.map((c) => ({
            key: c.key,
            label: c.label,
            value: c.spend,
            note: data.spend.value ? formatPercent((c.spend / data.spend.value) * 100, 0) : undefined,
            href: `/marketing?channel=${c.key}`,
            leads: c.leads,
            conversions: c.conversions,
          }))}
        />
        <RankingCard
          title="Leads by channel"
          description="Leads per channel, with how many converted"
          category="Channel"
          measure={{ key: "leads", label: "Leads", format: "number" }}
          columns={[{ key: "conversions", label: "Conversions", format: "number" }]}
          items={data.byChannel.map((c) => ({
            key: c.key,
            label: c.label,
            value: c.leads,
            note: `${formatNumber(c.conversions)} converted`,
            href: `/marketing?channel=${c.key}`,
            conversions: c.conversions,
          }))}
        />
        <RankingCard
          title="Cost per lead by channel"
          description="Spend ÷ leads · channels without leads are left out"
          category="Channel"
          measure={{ key: "costPerLead", label: "Cost per lead", format: "zar" }}
          items={channelCost("costPerLead")}
        />
        <RankingCard
          title="Cost per conversion by channel"
          description="Spend ÷ conversions · channels without conversions are left out"
          category="Channel"
          measure={{ key: "costPerConversion", label: "Cost per conversion", format: "zar" }}
          items={channelCost("costPerConversion")}
        />
      </ChartGrid>

      <SectionCard title="Campaign performance" description={`Campaigns with recorded results in the last ${ctx.periodLabel}, by spend`} flush>
        {data.byCampaign.length === 0 ? (
          <EmptyState icon={MegaphoneIcon} title="No campaign results" description="No campaign metrics were recorded for this period." compact />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Campaign</TableHead>
                <TableHead className="hidden lg:table-cell">Channel</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Leads</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Conversions</TableHead>
                <TableHead className="hidden text-right md:table-cell">Cost per lead</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Cost per conversion</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Conversion rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byCampaign.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-56">
                    <Link href={`/marketing/${c.id}`} className="block truncate font-medium hover:underline">
                      {c.name}
                    </Link>
                    <span className="mt-0.5 block lg:hidden">
                      <StatusBadge meta={CAMPAIGN_STATUS} value={c.status} />
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge meta={CAMPAIGN_CHANNEL} value={c.channel} dot={false} />
                      <StatusBadge meta={CAMPAIGN_STATUS} value={c.status} />
                    </span>
                  </TableCell>
                  <TableCell className="tabular text-right">{formatZAR(c.spend)}</TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{formatNumber(c.leads)}</TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{formatNumber(c.conversions)}</TableCell>
                  <TableCell className="tabular hidden text-right md:table-cell">{zarCents(c.costPerLead)}</TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{zarCents(c.costPerConversion)}</TableCell>
                  <TableCell className="tabular hidden text-right lg:table-cell">{formatPercent(c.conversionRate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
