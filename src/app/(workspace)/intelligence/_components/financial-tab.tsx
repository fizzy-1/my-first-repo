import { BanknoteIcon, FlameIcon, HourglassIcon, PercentIcon, ReceiptIcon, ScaleIcon, ServerIcon, WalletIcon } from "lucide-react";
import { COST_OF_REVENUE, financialIntelligence } from "@/server/services/intelligence";
import { ChartCard } from "@/components/charts/chart-card";
import { KpiCard } from "@/components/common/kpi-card";
import { EXPENSE_CATEGORY } from "@/lib/labels";
import { formatPercent, formatZAR } from "@/lib/format";
import { RankingCard } from "./ranking-card";
import { ChartGrid, Headline, RestrictedTab, StatGrid, type TabContext } from "./shared";

const money = (n: number) => formatZAR(n, { compact: Math.abs(n) >= 1_000_000 });
const points = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)} pts`);

export async function FinancialTab({ ctx }: { ctx: TabContext }) {
  if (!ctx.access.finance) {
    return <RestrictedTab title="Requires finance access" description="Margins, operating expenses, burn, runway and cash are only available to roles with finance access." />;
  }
  const data = await financialIntelligence(ctx.user, ctx.window);
  const { position } = data;
  const costOfRevenueLabels = COST_OF_REVENUE.map((c) => EXPENSE_CATEGORY[c].label.toLowerCase()).join(", ");
  const expenseTotal = data.byCategory.reduce((s, c) => s + c.amount, 0);
  const costBucket = data.costGranularity === "week" ? "Weekly" : ctx.bucketLabel;

  return (
    <div className="space-y-6">
      <StatGrid>
        <KpiCard
          label={`Revenue · last ${ctx.periodLabel}`}
          icon={BanknoteIcon}
          value={money(data.revenue.value)}
          delta={data.revenue.delta}
          deltaLabel={ctx.vsPrevious}
          details={[{ label: "Previous period", value: money(data.revenue.previous) }]}
        />
        <KpiCard
          label="Gross margin"
          icon={PercentIcon}
          value={formatPercent(data.grossMargin?.value ?? null)}
          details={[
            { label: "Gross profit", value: money(data.grossProfit) },
            { label: "Change", value: points(data.grossMargin?.change ?? null) },
          ]}
        />
        <KpiCard
          label="Cost of revenue"
          icon={ServerIcon}
          value={money(data.costOfRevenue.value)}
          delta={data.costOfRevenue.delta}
          deltaLabel={ctx.vsPrevious}
          upIsGood={false}
          details={[{ label: "Previous period", value: money(data.costOfRevenue.previous) }]}
        />
        <KpiCard
          label="Operating expenses"
          icon={ReceiptIcon}
          value={money(data.operatingExpenses.value)}
          delta={data.operatingExpenses.delta}
          deltaLabel={ctx.vsPrevious}
          upIsGood={false}
          href="/finance/expenses"
          details={[{ label: "Previous period", value: money(data.operatingExpenses.previous) }]}
        />
        <KpiCard
          label="Net income"
          icon={ScaleIcon}
          value={<span className={data.netIncome.value < 0 ? "text-danger" : undefined}>{money(data.netIncome.value)}</span>}
          delta={data.netIncome.delta}
          deltaLabel={ctx.vsPrevious}
          details={[
            { label: "Previous period", value: money(data.netIncome.previous) },
            { label: "Basis", value: "Accrual" },
          ]}
        />
        <KpiCard
          label="Cash balance"
          icon={WalletIcon}
          value={money(data.cash.value)}
          delta={data.cash.delta}
          deltaLabel={ctx.vsStart}
          href="/finance/cash-flow"
          details={[
            { label: "At period start", value: money(data.cash.previous) },
            { label: "One month ago", value: money(position.previousBalance) },
          ]}
        />
        <KpiCard
          label="Net burn · 3-month average"
          icon={FlameIcon}
          value={position.netBurn > 0 ? formatZAR(position.netBurn) : "None"}
          details={[
            { label: "Gross burn", value: formatZAR(position.grossBurn) },
            { label: "Basis", value: "Cash paid out" },
          ]}
        />
        <KpiCard
          label="Runway"
          icon={HourglassIcon}
          value={position.runwayMonths === null ? "Cash-flow positive" : `${position.runwayMonths.toFixed(1)} months`}
          details={[
            { label: "Cash balance", value: money(position.balance) },
            { label: "At net burn of", value: formatZAR(Math.max(0, position.netBurn)) },
          ]}
        />
      </StatGrid>

      <ChartGrid>
        <ChartCard
          title="Revenue vs costs"
          description={`${costBucket} revenue vs cost of revenue and operating expenses`}
          data={data.costTrend}
          format="zar"
          height={280}
          showTotal={false}
          series={[
            { key: "revenue", label: "Revenue", slot: 1, type: "bar" },
            { key: "costOfRevenue", label: "Cost of revenue", slot: 2, type: "bar", stackId: "costs" },
            { key: "operating", label: "Operating expenses", slot: 3, type: "bar", stackId: "costs" },
          ]}
        />
        <ChartCard
          title="Gross margin"
          description={`${costBucket} (revenue − cost of revenue) ÷ revenue`}
          headline={data.grossMargin && <Headline value={formatPercent(data.grossMargin.value)} caption={`last ${ctx.periodLabel}`} />}
          data={data.costTrend}
          format="percent"
          height={280}
          series={[{ key: "margin", label: "Gross margin", slot: 1, type: "line" }]}
        />
        <ChartCard
          title="Cash in vs cash out"
          description={`${ctx.bucketLabel} cash received (payments and income) and expenses paid`}
          data={data.cashFlow}
          format="zar"
          series={[
            { key: "cashIn", label: "Cash in", slot: 1, type: "bar" },
            { key: "cashOut", label: "Cash out", slot: 2, type: "bar" },
          ]}
        />
        <ChartCard
          title="Net cash flow"
          description={`${ctx.bucketLabel} cash in − cash out · below zero is burn`}
          data={data.cashFlow}
          format="zar"
          series={[{ key: "net", label: "Net cash flow", slot: 1, type: "line" }]}
        />
        <ChartCard
          title="Cash balance"
          description="Balance across active accounts at the end of each period"
          headline={<Headline value={formatZAR(data.cash.value)} caption="now" />}
          data={data.balance}
          format="zar"
          series={[{ key: "balance", label: "Cash balance", slot: 1, type: "area" }]}
        />
        <RankingCard
          title="Expenses by category"
          description={`Approved and paid · last ${ctx.periodLabel}. Cost of revenue (${costOfRevenueLabels}) counts against gross margin; everything else is operating expense.`}
          headline={<Headline value={formatZAR(expenseTotal)} caption="in total" />}
          category="Category"
          measure={{ key: "amount", label: "Amount", format: "zar" }}
          items={data.byCategory.map((c) => ({
            key: c.key,
            label: c.label,
            value: c.amount,
            note: c.costOfRevenue ? "Cost of revenue" : undefined,
            href: `/finance/expenses?category=${c.key}`,
          }))}
        />
      </ChartGrid>
    </div>
  );
}
