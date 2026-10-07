import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangleIcon, PiggyBankIcon, PlusIcon } from "lucide-react";
import { saveBudgetAction } from "@/server/actions/finance";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { departmentOptions } from "@/server/rbac";
import { listBudgets, yearElapsedShare } from "@/server/services/finance";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { FormDialog } from "@/components/forms/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { sastYear } from "@/lib/dates";
import { BUDGET_TYPE } from "@/lib/labels";
import { formatPercent, formatZAR } from "@/lib/format";
import { first } from "@/lib/list-params";
import { budgetDefaults, budgetFields } from "./budget-fields";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage(props: PageProps<"/finance/budgets">) {
  const user = await requirePageAccess("finance.read");
  const sp = await props.searchParams;
  const thisYear = sastYear(new Date());
  const y = Number(first(sp.year));
  const year = Number.isInteger(y) && y > 2000 && y < 2101 ? y : thisYear;
  const [budgets, departments] = await Promise.all([listBudgets(user, year), departmentOptions()]);
  const elapsed = yearElapsedShare(year);

  return (
    <>
      <PageHeader
        title="Budgets"
        description={`Budget vs actual for FY${year} (calendar year). ${year === thisYear ? `${formatPercent(elapsed * 100, 0)} of the year has elapsed — spending above that share is ahead of plan.` : ""}`}
        actions={
          can(user, "finance.budgets") && (
            <FormDialog
              title="Create budget"
              size="lg"
              trigger={
                <Button>
                  <PlusIcon /> New budget
                </Button>
              }
              action={saveBudgetAction}
              fields={budgetFields(departments)}
              defaultValues={budgetDefaults()}
              submitLabel="Create budget"
              successHref="/finance/budgets/{id}"
            />
          )
        }
      />
      <LinkTabs className="mb-4" tabs={[thisYear + 1, thisYear, thisYear - 1].map((yr) => ({ label: `FY${yr}`, href: `/finance/budgets?year=${yr}`, active: yr === year }))} />
      {budgets.length === 0 ? (
        <Card>
          <EmptyState icon={PiggyBankIcon} title={`No budgets for FY${year}`} description="Create annual, department, marketing, technology or academic budgets to compare against actual spend." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {budgets.map((b) => {
            const pct = b.budgetTotal ? (b.actualTotal / b.budgetTotal) * 100 : 0;
            const ahead = pct > elapsed * 100 + 5;
            return (
              <Link key={b.id} href={`/finance/budgets/${b.id}`} className="block">
                <Card className="h-full p-5 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{b.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {b.department?.name ?? "Company-wide"} · {b.lines.length} categories · by {b.createdBy.name}
                      </p>
                    </div>
                    <StatusBadge meta={BUDGET_TYPE} value={b.type} dot={false} />
                  </div>
                  <div className="mt-4 flex items-baseline justify-between">
                    <span className="tabular text-xl font-semibold">{formatZAR(b.actualTotal)}</span>
                    <span className="tabular text-sm text-muted-foreground">of {formatZAR(b.budgetTotal)}</span>
                  </div>
                  <Progress className="mt-2" value={pct} tone={pct > 100 ? "danger" : ahead ? "warning" : "primary"} label={`${b.name} spent`} />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular">{formatPercent(pct, 0)} spent</span>
                    {ahead && pct <= 100 && <Badge tone="warning">Ahead of plan</Badge>}
                    {b.overspent > 0 && (
                      <Badge tone="danger">
                        <AlertTriangleIcon /> {b.overspent} categor{b.overspent === 1 ? "y" : "ies"} over budget
                      </Badge>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
