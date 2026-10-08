import { BanknoteIcon, GraduationCapIcon, HourglassIcon, RefreshCwIcon, SchoolIcon, TrendingDownIcon, UsersIcon, WalletIcon } from "lucide-react";
import { intelligenceOverview } from "@/server/services/intelligence";
import { ChartCard } from "@/components/charts/chart-card";
import { KpiCard } from "@/components/common/kpi-card";
import { formatDelta, formatNumber, formatPercent, formatZAR } from "@/lib/format";
import { ChartGrid, Headline, RestrictedNote, RestrictedTab, StatGrid, type TabContext } from "./shared";

const compactZAR = (n: number) => formatZAR(n, { compact: Math.abs(n) >= 1_000_000 });

export async function OverviewTab({ ctx }: { ctx: TabContext }) {
  const data = await intelligenceOverview(ctx.user, ctx.window);
  const { access } = data;

  if (!access.finance && !access.learners && !access.schools) {
    return <RestrictedTab title="No company metrics for your role" description="The overview needs finance, executive dashboard or schools access." />;
  }

  const missing = [!access.finance && "finance", !access.learners && "executive dashboard", !access.schools && "schools"].filter(Boolean);
  const runway = data.cash?.position.runwayMonths;

  return (
    <div className="space-y-6">
      <StatGrid>
        {data.revenue && (
          <KpiCard
            label={`Revenue · last ${ctx.periodLabel}`}
            icon={BanknoteIcon}
            value={compactZAR(data.revenue.value)}
            delta={data.revenue.delta}
            deltaLabel={ctx.vsPrevious}
            href={ctx.tabHref("subscriptions")}
            details={[
              { label: "Subscriptions", value: formatZAR(data.revenue.streams.subscription, { compact: true }) },
              { label: "Schools + other", value: formatZAR(data.revenue.streams.school + data.revenue.streams.other, { compact: true }) },
            ]}
          />
        )}
        {data.mrr && (
          <KpiCard
            label="Monthly recurring revenue"
            icon={RefreshCwIcon}
            value={formatZAR(data.mrr.value)}
            delta={data.mrr.delta}
            deltaLabel={ctx.vsStart}
            href={ctx.tabHref("subscriptions")}
            details={[
              { label: "Subscriptions", value: formatZAR(data.mrr.now.subscription, { compact: true }) },
              { label: "Schools", value: formatZAR(data.mrr.now.school, { compact: true }) },
            ]}
          />
        )}
        {data.activeLearners && data.learners && (
          <KpiCard
            label="Active learners"
            icon={GraduationCapIcon}
            value={formatNumber(data.activeLearners.value)}
            delta={data.activeLearners.delta}
            deltaLabel={ctx.vsStart}
            href={ctx.tabHref("learners")}
            details={[
              { label: "School-sponsored", value: formatNumber(data.learners.schoolSponsored) },
              { label: "On trial", value: formatNumber(data.learners.trialing) },
            ]}
          />
        )}
        {data.payingLearners && data.learners && (
          <KpiCard
            label="Paying learners"
            icon={UsersIcon}
            value={formatNumber(data.payingLearners.value)}
            delta={data.payingLearners.delta}
            deltaLabel={ctx.vsStart}
            href={ctx.tabHref("learners")}
            details={[
              { label: "At period start", value: formatNumber(data.payingLearners.previous) },
              { label: "Share of active", value: formatPercent(data.activeLearners?.value ? (data.payingLearners.value / data.activeLearners.value) * 100 : null, 0) },
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
            href={ctx.tabHref("subscriptions")}
            details={[
              { label: "At period start", value: formatPercent(data.churn.previous) },
              { label: "Basis", value: "Paid, direct" },
            ]}
          />
        )}
        {data.schoolsWon && (
          <KpiCard
            label={`Schools won · last ${ctx.periodLabel}`}
            icon={SchoolIcon}
            value={formatNumber(data.schoolsWon.value)}
            delta={data.schoolsWon.delta}
            deltaLabel={ctx.vsPrevious}
            href={ctx.tabHref("schools")}
            details={[{ label: "Previous period", value: formatNumber(data.schoolsWon.previous) }]}
          />
        )}
        {data.cash && (
          <KpiCard
            label="Cash balance"
            icon={WalletIcon}
            value={compactZAR(data.cash.value)}
            delta={data.cash.delta}
            deltaLabel={ctx.vsStart}
            href={ctx.tabHref("financial")}
            details={[
              { label: "At period start", value: formatZAR(data.cash.previous, { compact: true }) },
              { label: "One month ago", value: formatZAR(data.cash.position.previousBalance, { compact: true }) },
            ]}
          />
        )}
        {data.cash && (
          <KpiCard
            label="Runway · 3-month avg burn"
            icon={HourglassIcon}
            value={runway === null || runway === undefined ? "Cash-flow positive" : `${runway.toFixed(1)} months`}
            href={ctx.tabHref("financial")}
            details={[
              { label: "Net burn / month", value: formatZAR(Math.max(0, data.cash.position.netBurn), { compact: true }) },
              { label: "Gross burn / month", value: formatZAR(data.cash.position.grossBurn, { compact: true }) },
            ]}
          />
        )}
      </StatGrid>

      {missing.length > 0 && <RestrictedNote>Figures that need {missing.join(" or ")} access are left out of this overview.</RestrictedNote>}

      {(data.revenueTrend || data.learnerTrend) && (
        <ChartGrid>
          {data.revenueTrend && (
            <ChartCard
              className={data.learnerTrend ? undefined : "lg:col-span-2"}
              title="Revenue by stream"
              description={`${ctx.bucketLabel} recognised revenue · last ${ctx.periodLabel}`}
              headline={data.revenue && <Headline value={formatZAR(data.revenue.value)} caption={data.revenue.delta === null ? undefined : `${formatDelta(data.revenue.delta)} ${ctx.vsPrevious}`} />}
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
          {data.learnerTrend && (
            <ChartCard
              className={data.revenueTrend ? undefined : "lg:col-span-2"}
              title="Learner base"
              description={`Learners at the end of each period · last ${ctx.periodLabel}`}
              headline={data.activeLearners && <Headline value={formatNumber(data.activeLearners.value)} caption="active learners" />}
              data={data.learnerTrend}
              height={280}
              series={[
                { key: "totalLearners", label: "Total learners", slot: 1, type: "line" },
                { key: "activeLearners", label: "Active learners", slot: 2, type: "line" },
                { key: "payingLearners", label: "Paying learners", slot: 3, type: "area" },
              ]}
            />
          )}
        </ChartGrid>
      )}
    </div>
  );
}
