import type { Metadata } from "next";
import { requirePageAccess } from "@/server/auth/current-user";
import { cashFlowStatement } from "@/server/services/finance";
import { ChartCard } from "@/components/charts/chart-card";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sastYear } from "@/lib/dates";
import { formatZAR } from "@/lib/format";
import { first } from "@/lib/list-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Cash flow" };

export default async function CashFlowPage(props: PageProps<"/finance/cash-flow">) {
  const user = await requirePageAccess("finance.read");
  const sp = await props.searchParams;
  const view = first(sp.view) === "annual" ? "annual" : "monthly";
  const thisYear = sastYear(new Date());
  const yearParam = Number(first(sp.year));
  const year = Number.isInteger(yearParam) && yearParam >= 2020 && yearParam <= thisYear ? yearParam : thisYear;
  const { rows, totals } = await cashFlowStatement(user, { view, year });
  const years = Array.from({ length: Math.min(4, thisYear - 2024) }, (_, i) => thisYear - i);

  const money = (n: number, emphasise = false) => (
    <span className={cn("tabular", n < 0 && "text-danger", emphasise && "font-semibold")}>{n === 0 ? "—" : formatZAR(n)}</span>
  );

  return (
    <>
      <PageHeader
        title="Cash flow"
        description="Opening balance + capital + cash received − cash paid = closing balance. Cash basis: subscription payments, income received and expenses paid."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <LinkTabs
          tabs={[
            { label: "Monthly", href: `/finance/cash-flow?year=${year}`, active: view === "monthly" },
            { label: "Annual", href: "/finance/cash-flow?view=annual", active: view === "annual" },
          ]}
        />
        {view === "monthly" && (
          <LinkTabs tabs={years.map((y) => ({ label: String(y), href: `/finance/cash-flow?year=${y}`, active: y === year }))} />
        )}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title="No financial records" description="No cash movements for this period." />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            <ChartCard
              title="Cash in vs cash out"
              description={view === "monthly" ? `Monthly · ${year}` : "By year"}
              data={rows}
              format="zar"
              series={[
                { key: "cashIn", label: "Cash in", slot: 1, type: "bar" },
                { key: "cashOut", label: "Cash out", slot: 2, type: "bar" },
              ]}
            />
            <ChartCard
              title="Closing cash balance"
              description="End of each period, including capital raised"
              data={rows}
              format="zar"
              series={[{ key: "closing", label: "Closing balance", slot: 1, type: "area" }]}
            />
          </div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Opening balance</TableHead>
                  <TableHead className="text-right">+ Capital</TableHead>
                  <TableHead className="text-right">+ Income</TableHead>
                  <TableHead className="text-right">− Expenses</TableHead>
                  <TableHead className="text-right">Net cash flow</TableHead>
                  <TableHead className="text-right">Closing balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium whitespace-nowrap">{r.label}</TableCell>
                    <TableCell className="text-right">{money(r.opening)}</TableCell>
                    <TableCell className="text-right">{money(r.capital)}</TableCell>
                    <TableCell className="text-right">{money(r.cashIn)}</TableCell>
                    <TableCell className="text-right">{money(-r.cashOut)}</TableCell>
                    <TableCell className="text-right">{money(r.net)}</TableCell>
                    <TableCell className="text-right">{money(r.closing, true)}</TableCell>
                  </TableRow>
                ))}
                {totals && (
                  <TableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{money(totals.opening)}</TableCell>
                    <TableCell className="text-right">{money(totals.capital)}</TableCell>
                    <TableCell className="text-right">{money(totals.cashIn)}</TableCell>
                    <TableCell className="text-right">{money(-totals.cashOut)}</TableCell>
                    <TableCell className="text-right">{money(totals.cashIn - totals.cashOut)}</TableCell>
                    <TableCell className="text-right">{money(totals.closing, true)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
