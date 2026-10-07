import type { Metadata } from "next";
import Link from "next/link";
import { FileTextIcon, PlusIcon, ReceiptIcon } from "lucide-react";
import { ExpenseCategory, ExpenseStatus } from "@prisma/client";
import { createExpenseAction, deleteExpenseAction, markExpensePaidAction, updateExpenseAction } from "@/server/actions/finance";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { departmentOptions } from "@/server/rbac";
import { APPROVAL_THRESHOLD, financeDocumentOptions, listExpenses, type ExpenseSort } from "@/server/services/finance";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { DueDate } from "@/components/common/due-date";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { FormDialog } from "@/components/forms/form-dialog";
import { RowMenu, type RowMenuItem } from "@/components/forms/row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { APPROVAL_STATUS, EXPENSE_CATEGORY, EXPENSE_STATUS, optionsOf } from "@/lib/labels";
import { formatDate, formatZAR } from "@/lib/format";
import { exportHref, oneOf, parseListParams } from "@/lib/list-params";
import { expenseDefaults, expenseFields } from "../fields";

export const metadata: Metadata = { title: "Expenses" };

const SORTS = ["date", "amount", "supplier", "number", "dueDate"] as const satisfies readonly ExpenseSort[];

export default async function ExpensesPage(props: PageProps<"/finance/expenses">) {
  const user = await requirePageAccess("finance.read");
  const sp = await props.searchParams;
  const params = parseListParams(sp, { sortable: SORTS, defaultSort: "date", defaultDir: "desc", pageSize: 25 });
  const canWrite = can(user, "finance.write");
  const [list, departments, documents] = await Promise.all([
    listExpenses(user, {
      q: params.q || undefined,
      status: oneOf<ExpenseStatus>(params.filter("status"), ExpenseStatus),
      category: oneOf<ExpenseCategory>(params.filter("category"), ExpenseCategory),
      departmentId: params.filter("department"),
      sort: params.sort,
      dir: params.dir,
      skip: params.skip,
      take: params.pageSize,
    }),
    departmentOptions(),
    financeDocumentOptions(),
  ]);
  const editFields = expenseFields({ departments, documents, isNew: false });

  const columns: Column<(typeof list.rows)[number]>[] = [
    { key: "number", header: "Ref", sortKey: "number", cell: (e) => <span className="tabular font-medium">EXP-{e.number}</span> },
    { key: "date", header: "Date", sortKey: "date", cell: (e) => <span className="tabular whitespace-nowrap">{formatDate(e.date)}</span> },
    {
      key: "supplier",
      header: "Supplier",
      sortKey: "supplier",
      cell: (e) => (
        <div className="min-w-48">
          <p className="font-medium">{e.supplier}</p>
          <p className="max-w-80 truncate text-xs text-muted-foreground">{e.description}</p>
        </div>
      ),
    },
    { key: "category", header: "Category", hideOnMobile: true, cell: (e) => <span className="text-muted-foreground">{EXPENSE_CATEGORY[e.category].label}</span> },
    { key: "department", header: "Department", hideOnMobile: true, cell: (e) => <span className="text-muted-foreground">{e.department?.name ?? "—"}</span> },
    {
      key: "doc",
      header: "Document",
      hideOnMobile: true,
      cell: (e) =>
        e.document ? (
          <Link href={`/documents/${e.document.id}`} className="inline-flex items-center gap-1 text-xs hover:underline" title={e.document.title}>
            <FileTextIcon className="size-3.5" /> View
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "status",
      header: "Payment status",
      cell: (e) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge meta={EXPENSE_STATUS} value={e.status} />
          {e.approval && (
            <Link href={`/approvals/${e.approval.id}`} className="text-[11px] text-muted-foreground hover:underline">
              Approval #{e.approval.number} · {APPROVAL_STATUS[e.approval.status].label}
            </Link>
          )}
        </div>
      ),
    },
    { key: "due", header: "Due", sortKey: "dueDate", hideOnMobile: true, cell: (e) => (e.status === "APPROVED" ? <DueDate date={e.dueDate} /> : <span className="text-muted-foreground">—</span>) },
    {
      key: "amount",
      header: "Amount",
      sortKey: "amount",
      align: "right",
      cell: (e) => (
        <span className="tabular inline-flex items-center gap-1.5 font-medium">
          {e.amount > APPROVAL_THRESHOLD && !e.approval && e.status !== "PAID" && <Badge tone="warning" title="Above the approval threshold without an approval">!</Badge>}
          {formatZAR(e.amount, { cents: true })}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (e) =>
        canWrite && (
          <RowMenu
            label={`EXP-${e.number}`}
            edit={{ title: `Edit EXP-${e.number}`, action: updateExpenseAction, fields: [{ type: "hidden", name: "id", value: e.id }, ...editFields], defaults: expenseDefaults(e), size: "lg" }}
            items={
              e.status === "APPROVED"
                ? ([
                    {
                      label: "Mark as paid",
                      icon: "banknote",
                      action: markExpensePaidAction,
                      input: { id: e.id },
                      confirm: { title: `Mark EXP-${e.number} as paid?`, description: `${e.supplier} · ${formatZAR(e.amount, { cents: true })}. Today's date will be recorded as the payment date.`, confirmLabel: "Mark paid" },
                    },
                  ] satisfies RowMenuItem[])
                : []
            }
            remove={
              e.status === "PAID"
                ? undefined
                : { action: deleteExpenseAction, input: { id: e.id }, title: `Delete EXP-${e.number}?`, description: "The expense will be permanently deleted. This is recorded in the audit log." }
            }
          />
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Expenses"
        description={`Supplier costs, payroll and purchases. Spend above ${formatZAR(APPROVAL_THRESHOLD)} goes through the approval workflow before it becomes payable.`}
        actions={
          canWrite && (
            <FormDialog
              title="Record expense"
              size="lg"
              trigger={
                <Button>
                  <PlusIcon /> Record expense
                </Button>
              }
              openParam="expense"
              action={createExpenseAction}
              fields={expenseFields({ departments, documents, isNew: true })}
              defaultValues={expenseDefaults()}
              submitLabel="Save expense"
            />
          )
        }
      />
      <Card className="overflow-hidden">
        <TableToolbar
          searchPlaceholder="Search supplier, description or EXP number…"
          filters={[
            { param: "status", label: "Status", options: optionsOf(EXPENSE_STATUS) },
            { param: "category", label: "Category", options: optionsOf(EXPENSE_CATEGORY) },
            { param: "department", label: "Department", options: departments },
          ]}
        >
          <span className="tabular text-xs text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{formatZAR(list.sum)}</span>
          </span>
          <Button asChild variant="outline" size="sm">
            <a href={exportHref("/api/reports/expenses", sp)} download>
              Export CSV
            </a>
          </Button>
        </TableToolbar>
        <DataTable
          columns={columns}
          rows={list.rows}
          total={list.total}
          params={params}
          pathname="/finance/expenses"
          searchParams={sp}
          empty={<EmptyState icon={ReceiptIcon} title="No financial records" description="No expenses match these filters." />}
        />
      </Card>
    </>
  );
}
