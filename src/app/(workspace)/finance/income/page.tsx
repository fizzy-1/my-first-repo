import type { Metadata } from "next";
import Link from "next/link";
import { LandmarkIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { IncomeCategory, IncomeStatus } from "@prisma/client";
import { createIncomeAction, deleteIncomeAction, markIncomeReceivedAction, updateIncomeAction } from "@/server/actions/finance";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { learnerPlatform } from "@/server/integrations/learner-platform";
import { listIncome, type IncomeSort } from "@/server/services/finance";
import { schoolOptions } from "@/server/services/schools";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { DueDate } from "@/components/common/due-date";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { FormDialog } from "@/components/forms/form-dialog";
import { RowMenu, type RowMenuItem } from "@/components/forms/row-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { addMonths, startOfMonth } from "@/lib/dates";
import { INCOME_CATEGORY, INCOME_STATUS, optionsOf, PAYMENT_METHOD } from "@/lib/labels";
import { formatDate, formatZAR } from "@/lib/format";
import { exportHref, oneOf, parseListParams } from "@/lib/list-params";
import { incomeDefaults, incomeFields } from "../fields";

export const metadata: Metadata = { title: "Income" };

const SORTS = ["date", "amount", "customer", "number", "dueDate"] as const satisfies readonly IncomeSort[];

export default async function IncomePage(props: PageProps<"/finance/income">) {
  const user = await requirePageAccess("finance.read");
  const sp = await props.searchParams;
  const params = parseListParams(sp, { sortable: SORTS, defaultSort: "date", defaultDir: "desc", pageSize: 25 });
  const canWrite = can(user, "finance.write");
  const now = new Date();
  const [list, schools, subsThisMonth, subsLastMonth] = await Promise.all([
    listIncome(user, {
      q: params.q || undefined,
      status: oneOf<IncomeStatus>(params.filter("status"), IncomeStatus),
      category: oneOf<IncomeCategory>(params.filter("category"), IncomeCategory),
      sort: params.sort,
      dir: params.dir,
      skip: params.skip,
      take: params.pageSize,
    }),
    schoolOptions(),
    learnerPlatform.subscriptionRevenueTotal(startOfMonth(now), now),
    learnerPlatform.subscriptionRevenueTotal(startOfMonth(addMonths(now, -1)), startOfMonth(now)),
  ]);
  const fields = incomeFields(schools);

  const columns: Column<(typeof list.rows)[number]>[] = [
    { key: "number", header: "Invoice", sortKey: "number", cell: (i) => <span className="tabular font-medium">INV-{i.number}</span> },
    { key: "date", header: "Date", sortKey: "date", cell: (i) => <span className="tabular whitespace-nowrap">{formatDate(i.date)}</span> },
    {
      key: "customer",
      header: "Customer",
      sortKey: "customer",
      cell: (i) => (
        <div className="min-w-48">
          <p className="font-medium">{i.school ? <Link href={`/schools/${i.school.id}`} className="hover:underline">{i.customer}</Link> : i.customer}</p>
          <p className="max-w-80 truncate text-xs text-muted-foreground">{i.description}</p>
        </div>
      ),
    },
    { key: "category", header: "Category", hideOnMobile: true, cell: (i) => <StatusBadge meta={INCOME_CATEGORY} value={i.category} dot={false} /> },
    { key: "method", header: "Method", hideOnMobile: true, cell: (i) => <span className="text-muted-foreground">{i.paymentMethod ? PAYMENT_METHOD[i.paymentMethod].label : "—"}</span> },
    { key: "reference", header: "Reference", hideOnMobile: true, cell: (i) => <span className="text-xs text-muted-foreground">{i.reference ?? "—"}</span> },
    { key: "due", header: "Due", sortKey: "dueDate", hideOnMobile: true, cell: (i) => <DueDate date={i.dueDate} done={i.status === "RECEIVED" || i.status === "CANCELLED"} /> },
    { key: "status", header: "Status", cell: (i) => <StatusBadge meta={INCOME_STATUS} value={i.status} /> },
    { key: "amount", header: "Amount", sortKey: "amount", align: "right", cell: (i) => <span className="tabular font-medium">{formatZAR(i.amount, { cents: true })}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (i) =>
        canWrite && (
          <RowMenu
            label={`INV-${i.number}`}
            edit={{ title: `Edit INV-${i.number}`, action: updateIncomeAction, fields: [{ type: "hidden", name: "id", value: i.id }, ...fields], defaults: incomeDefaults(i), size: "lg" }}
            items={
              i.status === "INVOICED" || i.status === "OVERDUE"
                ? ([{ label: "Mark as received", icon: "check", action: markIncomeReceivedAction, input: { id: i.id } }] satisfies RowMenuItem[])
                : []
            }
            remove={{ action: deleteIncomeAction, input: { id: i.id }, title: `Delete INV-${i.number}?`, description: "The income record is permanently removed. The deletion is recorded in the audit log." }}
          />
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Income"
        description="School contract invoices, workshops, grants, sponsorships and other income."
        actions={
          canWrite && (
            <FormDialog
              title="Record income"
              size="lg"
              trigger={
                <Button>
                  <PlusIcon /> Record income
                </Button>
              }
              openParam="income"
              action={createIncomeAction}
              fields={fields}
              defaultValues={incomeDefaults()}
              submitLabel="Save income"
            />
          )
        }
      />
      <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <span className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info">
          <RefreshCwIcon className="size-4" />
        </span>
        <div className="flex-1 text-sm">
          <p className="font-medium">Subscription revenue is synced from the learner platform</p>
          <p className="text-muted-foreground">Individual learner payments aren&apos;t listed here — they feed revenue, MRR and cash automatically.</p>
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">This month</p>
            <p className="tabular font-semibold">{formatZAR(subsThisMonth)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last month</p>
            <p className="tabular font-semibold">{formatZAR(subsLastMonth)}</p>
          </div>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <TableToolbar
          searchPlaceholder="Search customer, reference or INV number…"
          filters={[
            { param: "status", label: "Status", options: optionsOf(INCOME_STATUS) },
            { param: "category", label: "Category", options: optionsOf(INCOME_CATEGORY) },
          ]}
        >
          <span className="tabular text-xs text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{formatZAR(list.sum)}</span>
          </span>
          <Button asChild variant="outline" size="sm">
            <a href={exportHref("/api/reports/income", sp)} download>
              Export CSV
            </a>
          </Button>
        </TableToolbar>
        <DataTable
          columns={columns}
          rows={list.rows}
          total={list.total}
          params={params}
          pathname="/finance/income"
          searchParams={sp}
          empty={<EmptyState icon={LandmarkIcon} title="No financial records" description="Recorded income will appear here." />}
        />
      </Card>
    </>
  );
}
