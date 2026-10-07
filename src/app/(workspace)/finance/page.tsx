import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeftIcon, ArrowUpRightIcon, BanknoteIcon, FileWarningIcon, FlameIcon, HourglassIcon, LandmarkIcon, ReceiptIcon, ScaleIcon, WalletIcon } from "lucide-react";
import { requirePageAccess } from "@/server/auth/current-user";
import { financeOverview } from "@/server/services/finance";
import { ChartCard } from "@/components/charts/chart-card";
import { KpiCard } from "@/components/common/kpi-card";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { EXPENSE_STATUS, INCOME_STATUS } from "@/lib/labels";
import { formatDate, formatZAR } from "@/lib/format";
import { percentChange } from "@/lib/utils";

export const metadata: Metadata = { title: "Finance" };

export default async function FinanceOverviewPage() {
  const user = await requirePageAccess("finance.read");
  const data = await financeOverview(user);
  const { cash, arap } = data;
  const maxCategory = Math.max(1, ...data.byCategory.map((c) => c.amount));
  const ytdTotal = data.byCategory.reduce((s, c) => s + c.amount, 0);

  return (
    <>
      <PageHeader
        title="Financial overview"
        description="Revenue, expenses, cash and working capital. Subscription payments sync automatically from the learner platform."
        actions={
          <Button asChild variant="outline">
            <a href="/api/reports/finance-summary" download>Export summary (CSV)</a>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Revenue · month to date" icon={BanknoteIcon} value={formatZAR(data.revenueMtd.total)} delta={percentChange(data.revenueMtd.total, data.revenuePrev.total)} deltaLabel="vs same period last month" details={[{ label: "Subscriptions", value: formatZAR(data.revenueMtd.subscription) }, { label: "Schools + other", value: formatZAR(data.revenueMtd.school + data.revenueMtd.other) }]} />
        <KpiCard label="Expenses · month to date" icon={ReceiptIcon} value={formatZAR(data.expensesMtd)} delta={percentChange(data.expensesMtd, data.expensesPrev)} deltaLabel="vs same period last month" upIsGood={false} href="/finance/expenses" />
        <KpiCard label="Net income · month to date" icon={ScaleIcon} value={formatZAR(data.netMtd)} details={[{ label: "Same period last month", value: formatZAR(data.netPrev) }]} />
        <KpiCard label="Cash balance" icon={WalletIcon} value={formatZAR(cash.balance)} delta={percentChange(cash.balance, cash.previousBalance)} deltaLabel="vs one month ago" href="/finance/cash-flow" />
        <KpiCard label="Accounts receivable" icon={ArrowDownLeftIcon} value={formatZAR(arap.receivables)} href="/finance/income?status=INVOICED" details={[{ label: "Open invoices", value: arap.receivablesCount }, { label: "Overdue", value: <span className={arap.overdueCount ? "text-danger" : undefined}>{formatZAR(arap.overdueReceivables)}</span> }]} />
        <KpiCard label="Accounts payable" icon={ArrowUpRightIcon} value={formatZAR(arap.payables)} href="/finance/expenses?status=APPROVED" details={[{ label: "Approved, unpaid", value: arap.payablesCount }, { label: "Pending approval", value: formatZAR(arap.pendingApproval) }]} />
        <KpiCard label="Monthly burn (3-month avg)" icon={FlameIcon} value={formatZAR(cash.grossBurn)} details={[{ label: "Net burn", value: formatZAR(cash.netBurn) }, { label: "Basis", value: "Cash paid out" }]} upIsGood={false} />
        <KpiCard label="Runway" icon={HourglassIcon} value={cash.runwayMonths === null ? "Positive" : `${cash.runwayMonths.toFixed(1)} months`} details={[{ label: "At net burn of", value: formatZAR(Math.max(0, cash.netBurn)) }]} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Revenue vs expenses"
          description="Last 12 months · recognised revenue against approved and paid expenses"
          data={data.series}
          format="zar"
          height={300}
          series={[
            { key: "revenue", label: "Revenue", slot: 1, type: "bar" },
            { key: "expenses", label: "Expenses", slot: 2, type: "bar" },
          ]}
        />
        <SectionCard title="Expenses by category" description={`Year to date · ${formatZAR(ytdTotal)}`}>
          <ul className="space-y-2.5">
            {data.byCategory.map((c) => (
              <li key={c.category}>
                <div className="flex items-baseline justify-between text-sm">
                  <Link href={`/finance/expenses?category=${c.category}`} className="hover:underline">
                    {c.label}
                  </Link>
                  <span className="tabular text-muted-foreground">{formatZAR(c.amount)}</span>
                </div>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-chart-1" style={{ width: `${(c.amount / maxCategory) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard title="Recent income" actions={<Button asChild variant="ghost" size="sm"><Link href="/finance/income">All income</Link></Button>}>
          <ul className="divide-y divide-border">
            {data.recentIncome.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2.5 text-sm">
                <LandmarkIcon className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.customer}</p>
                  <p className="text-xs text-muted-foreground">INV-{i.number} · {formatDate(i.date)}</p>
                </div>
                <StatusBadge meta={INCOME_STATUS} value={i.status} />
                <span className="tabular w-24 text-right font-medium">{formatZAR(i.amount)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard title="Recent expenses" actions={<Button asChild variant="ghost" size="sm"><Link href="/finance/expenses">All expenses</Link></Button>}>
          <ul className="divide-y divide-border">
            {data.recentExpenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                <FileWarningIcon className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.supplier}</p>
                  <p className="text-xs text-muted-foreground">EXP-{e.number} · {formatDate(e.date)}</p>
                </div>
                <StatusBadge meta={EXPENSE_STATUS} value={e.status} />
                <span className="tabular w-24 text-right font-medium">{formatZAR(e.amount)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
