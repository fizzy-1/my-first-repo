import { GraduationCapIcon, SchoolIcon, TrendingDownIcon, UserPlusIcon, UsersIcon, UsersRoundIcon } from "lucide-react";
import { learnerIntelligence } from "@/server/services/intelligence";
import { ChartCard } from "@/components/charts/chart-card";
import { KpiCard } from "@/components/common/kpi-card";
import { formatNumber, formatPercent } from "@/lib/format";
import { RankingCard } from "./ranking-card";
import { ChartGrid, Headline, RestrictedTab, StatGrid, type TabContext } from "./shared";

export async function LearnersTab({ ctx }: { ctx: TabContext }) {
  if (!ctx.access.learners) {
    return <RestrictedTab title="Requires executive dashboard access" description="Learner metrics are available to roles with company-wide executive KPIs." />;
  }
  const data = await learnerIntelligence(ctx.user, ctx.window);
  const provinceTotal = data.byProvince.reduce((s, r) => s + r.learners, 0);
  const planTotal = data.byPlan.reduce((s, r) => s + r.subscriptions, 0);
  const share = (n: number, total: number) => (total ? formatPercent((n / total) * 100, 0) : undefined);

  return (
    <div className="space-y-6">
      <StatGrid className="xl:grid-cols-3">
        <KpiCard
          label="Total learners"
          icon={UsersRoundIcon}
          value={formatNumber(data.total.value)}
          delta={data.total.delta}
          deltaLabel={ctx.vsStart}
          details={[
            { label: "At period start", value: formatNumber(data.total.previous) },
            { label: "Basis", value: "Ever signed up" },
          ]}
        />
        <KpiCard
          label="Active learners"
          icon={GraduationCapIcon}
          value={formatNumber(data.active.value)}
          delta={data.active.delta}
          deltaLabel={ctx.vsStart}
          details={[
            { label: "At period start", value: formatNumber(data.active.previous) },
            { label: "Share of all learners", value: share(data.active.value, data.total.value) ?? "—" },
          ]}
        />
        <KpiCard
          label="Paying learners"
          icon={UsersIcon}
          value={formatNumber(data.paying.value)}
          delta={data.paying.delta}
          deltaLabel={ctx.vsStart}
          details={[
            { label: "At period start", value: formatNumber(data.paying.previous) },
            { label: "On trial now", value: formatNumber(data.trialing.value) },
          ]}
        />
        <KpiCard
          label={`New sign-ups · last ${ctx.periodLabel}`}
          icon={UserPlusIcon}
          value={formatNumber(data.newLearners.value)}
          delta={data.newLearners.delta}
          deltaLabel={ctx.vsPrevious}
          details={[{ label: "Previous period", value: formatNumber(data.newLearners.previous) }]}
        />
        <KpiCard
          label={`Churned · last ${ctx.periodLabel}`}
          icon={TrendingDownIcon}
          value={formatNumber(data.churned.value)}
          delta={data.churned.delta}
          deltaLabel={ctx.vsPrevious}
          upIsGood={false}
          details={[
            { label: "Previous period", value: formatNumber(data.churned.previous) },
            { label: "Definition", value: "Paid cancellations" },
          ]}
        />
        <KpiCard
          label="School-sponsored seats"
          icon={SchoolIcon}
          value={formatNumber(data.schoolSponsored.value)}
          delta={data.schoolSponsored.delta}
          deltaLabel={ctx.vsStart}
          details={[{ label: "At period start", value: formatNumber(data.schoolSponsored.previous) }]}
        />
      </StatGrid>

      <ChartGrid>
        <ChartCard
          title="Learner growth"
          description={`Learners at the end of each period · last ${ctx.periodLabel}`}
          headline={<Headline value={formatNumber(data.total.value)} caption="learners" />}
          data={data.growth}
          height={280}
          series={[
            { key: "totalLearners", label: "Total learners", slot: 1, type: "line" },
            { key: "activeLearners", label: "Active learners", slot: 2, type: "line" },
            { key: "payingLearners", label: "Paying learners", slot: 3, type: "area" },
          ]}
        />
        <ChartCard
          title="New vs churned learners"
          description={`${ctx.bucketLabel} sign-ups and paid cancellations`}
          headline={<Headline value={formatNumber(data.newLearners.value - data.churned.value)} caption="net new learners" />}
          data={data.growth}
          height={280}
          series={[
            { key: "newLearners", label: "New learners", slot: 1, type: "bar" },
            { key: "churned", label: "Churned learners", slot: 2, type: "bar" },
          ]}
        />
        <RankingCard
          title="Learners by province"
          description="Every learner who has signed up, by home province"
          category="Province"
          measure={{ key: "learners", label: "Learners", format: "number" }}
          items={data.byProvince.map((r) => ({ key: r.key, label: r.label, value: r.learners, note: share(r.learners, provinceTotal) }))}
        />
        <RankingCard
          title="Live subscriptions by plan"
          description="Subscriptions live today, including trials and school-sponsored seats"
          category="Plan"
          measure={{ key: "subscriptions", label: "Subscriptions", format: "number" }}
          items={data.byPlan.map((r) => ({ key: r.key, label: r.label, value: r.subscriptions, note: share(r.subscriptions, planTotal) }))}
        />
      </ChartGrid>
    </div>
  );
}
