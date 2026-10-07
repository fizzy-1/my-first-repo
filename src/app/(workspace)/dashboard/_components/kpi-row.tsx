import { BanknoteIcon, GraduationCapIcon, RefreshCwIcon, SchoolIcon, TrendingDownIcon, WalletIcon } from "lucide-react";
import { KpiCard } from "@/components/common/kpi-card";
import { formatNumber, formatPercent, formatZAR } from "@/lib/format";
import { percentChange } from "@/lib/utils";
import type { DashboardData } from "./types";

export function KpiRow({ data }: { data: DashboardData }) {
  const cards: React.ReactNode[] = [];
  const { revenue, learners, mrr, churn, schools, cash } = data;

  if (revenue) {
    cards.push(
      <KpiCard
        key="revenue"
        label="Revenue · month to date"
        icon={BanknoteIcon}
        value={formatZAR(revenue.now.total, { compact: revenue.now.total >= 1_000_000 })}
        delta={revenue.growth}
        deltaLabel="vs same period last month"
        href="/finance"
        details={[
          { label: "Previous month", value: formatZAR(revenue.prevFull.total) },
          { label: "Same period last month", value: formatZAR(revenue.prevSame.total) },
        ]}
      />,
    );
  }
  if (learners) {
    cards.push(
      <KpiCard
        key="learners"
        label="Active learners"
        icon={GraduationCapIcon}
        value={formatNumber(learners.current.activeLearners)}
        delta={learners.activeGrowth}
        deltaLabel="vs one month ago"
        href="/intelligence?tab=learners"
        details={[
          { label: "New this month", value: formatNumber(learners.newThisMonth) },
          { label: "Paying learners", value: formatNumber(learners.current.payingLearners) },
        ]}
      />,
    );
  }
  if (mrr) {
    cards.push(
      <KpiCard
        key="mrr"
        label="Monthly recurring revenue"
        icon={RefreshCwIcon}
        value={formatZAR(mrr.now.total)}
        delta={mrr.growth}
        deltaLabel="vs one month ago"
        href="/intelligence?tab=subscriptions"
        details={[
          { label: "Previous MRR", value: formatZAR(mrr.prev.total) },
          { label: "Subscriptions · schools", value: `${formatZAR(mrr.now.subscription, { compact: true })} · ${formatZAR(mrr.now.school, { compact: true })}` },
        ]}
      />,
    );
  }
  if (churn) {
    cards.push(
      <KpiCard
        key="churn"
        label="Churn · trailing 30 days"
        icon={TrendingDownIcon}
        value={formatPercent(churn.now)}
        delta={percentChange(churn.now, churn.prev)}
        deltaLabel="vs previous 30 days"
        upIsGood={false}
        href="/intelligence?tab=subscriptions"
        details={[
          { label: "Previous period", value: formatPercent(churn.prev) },
          { label: "Definition", value: "Paid cancellations ÷ paying base" },
        ]}
      />,
    );
  }
  if (schools) {
    cards.push(
      <KpiCard
        key="schools"
        label="School partnerships"
        icon={SchoolIcon}
        value={formatNumber(schools.activePartnerships)}
        delta={percentChange(schools.activePartnerships, schools.previousActivePartnerships)}
        deltaLabel="active vs one month ago"
        href="/schools"
        details={[
          { label: "Open prospects", value: formatNumber(schools.prospects) },
          { label: "Conversion (won ÷ closed)", value: formatPercent(schools.conversionRate, 0) },
        ]}
      />,
    );
  }
  if (cash) {
    cards.push(
      <KpiCard
        key="cash"
        label="Cash position"
        icon={WalletIcon}
        value={formatZAR(cash.balance, { compact: Math.abs(cash.balance) >= 1_000_000 })}
        delta={percentChange(cash.balance, cash.previousBalance)}
        deltaLabel="vs one month ago"
        href="/finance/cash-flow"
        details={[
          { label: "Monthly burn (3-mo avg)", value: formatZAR(cash.grossBurn) },
          { label: "Runway", value: cash.runwayMonths === null ? "Cash-flow positive" : `${cash.runwayMonths.toFixed(1)} months` },
        ]}
      />,
    );
  }

  if (cards.length === 0) return null;
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{cards}</div>;
}
