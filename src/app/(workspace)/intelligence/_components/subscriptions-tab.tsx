import { BanknoteIcon, CreditCardIcon, RefreshCwIcon, TrendingDownIcon, UserMinusIcon, UserRoundCheckIcon } from "lucide-react";
import { subscriptionIntelligence } from "@/server/services/intelligence";
import { ChartCard } from "@/components/charts/chart-card";
import { KpiCard } from "@/components/common/kpi-card";
import { formatDelta, formatNumber, formatPercent, formatZAR } from "@/lib/format";
import { RankingCard } from "./ranking-card";
import { ChartGrid, Headline, RestrictedNote, RestrictedTab, StatGrid, type TabContext } from "./shared";

export async function SubscriptionsTab({ ctx }: { ctx: TabContext }) {
  if (!ctx.access.learners && !ctx.access.finance) {
    return <RestrictedTab title="Requires finance or executive dashboard access" description="Subscription and revenue metrics are limited to finance and executive roles." />;
  }
  const data = await subscriptionIntelligence(ctx.user, ctx.window);
  const mrrPlanTotal = data.mrrByPlan?.reduce((s, r) => s + r.mrr, 0) ?? 0;

  return (
    <div className="space-y-6">
      <StatGrid className="xl:grid-cols-3">
        {data.mrr && (
          <KpiCard
            label="Monthly recurring revenue"
            icon={RefreshCwIcon}
            value={formatZAR(data.mrr.value)}
            delta={data.mrr.delta}
            deltaLabel={ctx.vsStart}
            details={[
              { label: "Subscriptions", value: formatZAR(data.mrr.now.subscription, { compact: true }) },
              { label: "School partnerships", value: formatZAR(data.mrr.now.school, { compact: true }) },
            ]}
          />
        )}
        {data.arpu && (
          <KpiCard
            label="ARPU · per paying learner"
            icon={CreditCardIcon}
            value={formatZAR(data.arpu.value, { cents: true })}
            delta={data.arpu.delta}
            deltaLabel={ctx.vsStart}
            details={[
              { label: "At period start", value: formatZAR(data.arpu.previous, { cents: true }) },
              { label: "Basis", value: "Subscription MRR" },
            ]}
          />
        )}
        {data.revenue && (
          <KpiCard
            label={`Revenue · last ${ctx.periodLabel}`}
            icon={BanknoteIcon}
            value={formatZAR(data.revenue.value, { compact: data.revenue.value >= 1_000_000 })}
            delta={data.revenue.delta}
            deltaLabel={ctx.vsPrevious}
            details={[
              { label: "Subscriptions", value: formatZAR(data.revenue.streams.subscription, { compact: true }) },
              { label: "Schools + other", value: formatZAR(data.revenue.streams.school + data.revenue.streams.other, { compact: true }) },
            ]}
          />
        )}
        {data.churn && (
          <KpiCard
            label="Churn · trailing 30 days"
            icon={TrendingDownIcon}
            value={formatPercent(data.churn.value)}
            delta={data.churn.delta}
            deltaLabel={ctx.vsStart}
            upIsGood={false}
            details={[
              { label: "At period start", value: formatPercent(data.churn.previous) },
              { label: "Basis", value: "Paid, direct" },
            ]}
          />
        )}
        {data.payingSubscriptions && (
          <KpiCard
            label="Paid subscriptions"
            icon={UserRoundCheckIcon}
            value={formatNumber(data.payingSubscriptions.value)}
            delta={data.payingSubscriptions.delta}
            deltaLabel={ctx.vsStart}
            details={[
              { label: "At period start", value: formatNumber(data.payingSubscriptions.previous) },
              { label: "Basis", value: "Live, paid, direct" },
            ]}
          />
        )}
        {data.cancellations && (
          <KpiCard
            label={`Cancellations · last ${ctx.periodLabel}`}
            icon={UserMinusIcon}
            value={formatNumber(data.cancellations.value)}
            delta={data.cancellations.delta}
            deltaLabel={ctx.vsPrevious}
            upIsGood={false}
            details={[{ label: "Previous period", value: formatNumber(data.cancellations.previous) }]}
          />
        )}
      </StatGrid>

      {!data.access.finance && <RestrictedNote>MRR, ARPU and revenue figures require finance access.</RestrictedNote>}

      <ChartGrid>
        {data.mrrTrend && (
          <ChartCard
            title="Monthly recurring revenue"
            description={`MRR at the end of each period, by source · last ${ctx.periodLabel}`}
            headline={data.mrr && <Headline value={formatZAR(data.mrr.value)} caption={data.mrr.delta === null ? undefined : `${formatDelta(data.mrr.delta)} ${ctx.vsStart}`} />}
            data={data.mrrTrend}
            format="zar"
            height={280}
            series={[
              { key: "subscription", label: "Subscriptions", slot: 1, type: "line" },
              { key: "school", label: "School partnerships", slot: 2, type: "line" },
            ]}
          />
        )}
        {data.revenueTrend && (
          <ChartCard
            title="Revenue by stream"
            description={`${ctx.bucketLabel} recognised revenue · last ${ctx.periodLabel}`}
            headline={data.revenue && <Headline value={formatZAR(data.revenue.value)} caption={`last ${ctx.periodLabel}`} />}
            data={data.revenueTrend}
            format="zar"
            height={280}
            series={[
              { key: "subscription", label: "Subscriptions", slot: 1, type: "bar", stackId: "rev" },
              { key: "school", label: "School contracts", slot: 2, type: "bar", stackId: "rev" },
              { key: "other", label: "Other income", slot: 3, type: "bar", stackId: "rev" },
            ]}
          />
        )}
        {data.mrrTrend && (
          <ChartCard
            title="Average revenue per paying learner"
            description="Subscription MRR ÷ paying learners at the end of each period"
            headline={data.arpu && <Headline value={formatZAR(data.arpu.value, { cents: true })} caption="per month" />}
            data={data.mrrTrend}
            format="zar"
            height={240}
            series={[{ key: "arpu", label: "ARPU", slot: 1, type: "line" }]}
          />
        )}
        {data.mrrByPlan && (
          <RankingCard
            title="MRR by plan"
            description="Recurring revenue from subscriptions live today"
            category="Plan"
            measure={{ key: "mrr", label: "MRR", format: "zar" }}
            items={data.mrrByPlan.map((r) => ({ key: r.key, label: r.label, value: r.mrr, note: mrrPlanTotal ? formatPercent((r.mrr / mrrPlanTotal) * 100, 0) : undefined }))}
          />
        )}
        {data.churnTrend && (
          <ChartCard
            title="Churn rate"
            description="Trailing 30-day churn at the end of each period"
            headline={data.churn && <Headline value={formatPercent(data.churn.value)} caption="now" />}
            data={data.churnTrend}
            format="percent"
            height={240}
            series={[{ key: "churn", label: "Churn rate", slot: 1, type: "line" }]}
          />
        )}
        {data.cancellationTrend && (
          <ChartCard
            title="Paid cancellations"
            description={`${ctx.bucketLabel} cancellations of paid, direct subscriptions`}
            headline={data.cancellations && <Headline value={formatNumber(data.cancellations.value)} caption={`last ${ctx.periodLabel}`} />}
            data={data.cancellationTrend}
            height={240}
            series={[{ key: "churned", label: "Cancellations", slot: 1, type: "bar" }]}
          />
        )}
      </ChartGrid>
    </div>
  );
}
