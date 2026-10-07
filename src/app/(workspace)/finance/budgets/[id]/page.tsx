import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { deleteBudgetAction, saveBudgetAction } from "@/server/actions/finance";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors";
import { departmentOptions } from "@/server/rbac";
import { getBudget, yearElapsedShare } from "@/server/services/finance";
import { ChartCard } from "@/components/charts/chart-card";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BUDGET_TYPE, EXPENSE_CATEGORY } from "@/lib/labels";
import { formatPercent, formatZAR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { budgetDefaults, budgetFields } from "../budget-fields";

export const metadata: Metadata = { title: "Budget" };

export default async function BudgetDetailPage(props: PageProps<"/finance/budgets/[id]">) {
  const { id } = await props.params;
  const user = await requirePageAccess("finance.read");
  let budget: Awaited<ReturnType<typeof getBudget>>;
  try {
    budget = await getBudget(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const departments = await departmentOptions();
  const elapsed = yearElapsedShare(budget.fiscalYear);
  const canEdit = can(user, "finance.budgets");

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Budgets", href: `/finance/budgets?year=${budget.fiscalYear}` }, { label: budget.name }]}
        title={budget.name}
        description={budget.notes ?? undefined}
        meta={
          <>
            <StatusBadge meta={BUDGET_TYPE} value={budget.type} dot={false} />
            <Badge tone="outline">FY{budget.fiscalYear}</Badge>
            <Badge tone="outline">{budget.department?.name ?? "Company-wide"}</Badge>
          </>
        }
        actions={
          canEdit && (
            <>
              <FormDialog
                title="Edit budget"
                size="lg"
                trigger={
                  <Button variant="outline">
                    <PencilIcon /> Edit
                  </Button>
                }
                action={saveBudgetAction}
                fields={[{ type: "hidden", name: "id", value: budget.id }, ...budgetFields(departments)]}
                defaultValues={budgetDefaults(budget)}
                submitLabel="Save budget"
              />
              <ConfirmActionButton variant="outline" action={deleteBudgetAction} input={{ id: budget.id }} title="Delete this budget?" description="The budget and its lines are removed. Expenses are not affected." confirmLabel="Delete budget">
                <Trash2Icon /> Delete
              </ConfirmActionButton>
            </>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Budget</p>
          <p className="tabular mt-1 text-2xl font-semibold">{formatZAR(budget.budgetTotal)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Actual to date</p>
          <p className="tabular mt-1 text-2xl font-semibold">{formatZAR(budget.actualTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatPercent((budget.actualTotal / (budget.budgetTotal || 1)) * 100, 0)} used · {formatPercent(elapsed * 100, 0)} of year elapsed</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Remaining</p>
          <p className={cn("tabular mt-1 text-2xl font-semibold", budget.budgetTotal - budget.actualTotal < 0 && "text-danger")}>{formatZAR(budget.budgetTotal - budget.actualTotal)}</p>
        </Card>
      </div>
      <ChartCard
        className="mb-6"
        title="Cumulative spend vs plan"
        description="Actual spend in budgeted categories against a straight-line plan"
        data={budget.burndown}
        format="zar"
        series={[
          { key: "budget", label: "Plan (straight-line)", slot: 2, type: "line" },
          { key: "actual", label: "Actual", slot: 1, type: "area" },
        ]}
      />
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead className="w-64">Used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {budget.lines.map((l) => {
              const pct = l.amount ? (l.actual / l.amount) * 100 : 0;
              const variance = l.amount - l.actual;
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{EXPENSE_CATEGORY[l.category].label}</TableCell>
                  <TableCell className="tabular text-right">{formatZAR(l.amount)}</TableCell>
                  <TableCell className="tabular text-right">{formatZAR(l.actual)}</TableCell>
                  <TableCell className={cn("tabular text-right", variance < 0 && "font-medium text-danger")}>{variance < 0 ? `−${formatZAR(-variance)} over` : formatZAR(variance)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={pct} tone={pct > 100 ? "danger" : pct > elapsed * 100 + 5 ? "warning" : "primary"} label={`${EXPENSE_CATEGORY[l.category].label} used`} />
                      <span className="tabular w-10 text-right text-xs text-muted-foreground">{Math.round(pct)}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
