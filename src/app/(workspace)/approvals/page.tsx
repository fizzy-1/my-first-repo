import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2Icon, PlusIcon } from "lucide-react";
import { ApprovalStatus, ApprovalType } from "@prisma/client";
import { createApprovalAction } from "@/server/actions/approvals";
import { can, requireUser } from "@/server/auth/current-user";
import { usersWithPermission } from "@/server/rbac";
import { approvalLinkOptions, listApprovals, type ApprovalScope } from "@/server/services/approvals";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { DueDate } from "@/components/common/due-date";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { UserChip } from "@/components/common/user-chip";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { APPROVAL_STATUS, APPROVAL_TYPE, optionsOf, PRIORITY } from "@/lib/labels";
import { formatRelative, formatZAR } from "@/lib/format";
import { buildHref, oneOf, parseListParams } from "@/lib/list-params";
import { approvalFields } from "./approval-fields";

export const metadata: Metadata = { title: "Approvals" };

const SORTS = ["createdAt", "dueDate", "amount", "number"] as const;

export default async function ApprovalsPage(props: PageProps<"/approvals">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const params = parseListParams(sp, { sortable: SORTS, defaultSort: "createdAt", defaultDir: "desc" });
  const canDecideAny = can(user, "approvals.decide") || can(user, "approvals.decide.finance");
  const defaultScope: ApprovalScope = canDecideAny ? "awaiting" : "mine";
  const scope = oneOf<ApprovalScope>(params.filter("scope"), ["awaiting", "mine", "all"]) ?? defaultScope;

  const [list, approvers, links, awaiting, mine] = await Promise.all([
    listApprovals(user, {
      scope,
      q: params.q || undefined,
      status: oneOf<ApprovalStatus>(params.filter("status"), ApprovalStatus),
      type: oneOf<ApprovalType>(params.filter("type"), ApprovalType),
      sort: params.sort,
      dir: params.dir,
      skip: params.skip,
      take: params.pageSize,
    }),
    usersWithPermission(["approvals.decide", "approvals.decide.finance"]),
    approvalLinkOptions(user),
    listApprovals(user, { scope: "awaiting", sort: "createdAt", dir: "desc", skip: 0, take: 0 }),
    listApprovals(user, { scope: "mine", status: "PENDING", sort: "createdAt", dir: "desc", skip: 0, take: 0 }),
  ]);

  const fields = approvalFields({
    approvers: approvers.filter((a) => a.id !== user.id).map((a) => ({ value: a.id, label: a.name })),
    ...links,
  });

  const columns: Column<(typeof list.rows)[number]>[] = [
    {
      key: "title",
      header: "Request",
      sortKey: "number",
      cell: (a) => (
        <div className="min-w-56">
          <Link href={`/approvals/${a.id}`} className="font-medium hover:underline">
            {a.title}
          </Link>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular">#{a.number}</span>·<span>{APPROVAL_TYPE[a.type].label}</span>·<span>{formatRelative(a.createdAt)}</span>
          </div>
        </div>
      ),
    },
    { key: "requester", header: "Requested by", hideOnMobile: true, cell: (a) => <UserChip name={a.requester.name} /> },
    { key: "amount", header: "Amount", sortKey: "amount", align: "right", cell: (a) => <span className="tabular">{a.amount !== null ? formatZAR(a.amount) : "—"}</span> },
    { key: "priority", header: "Priority", hideOnMobile: true, cell: (a) => <StatusBadge meta={PRIORITY} value={a.priority} dot={false} /> },
    { key: "due", header: "Needed by", sortKey: "dueDate", hideOnMobile: true, cell: (a) => <DueDate date={a.dueDate} done={a.status !== "PENDING"} /> },
    { key: "status", header: "Status", cell: (a) => <StatusBadge meta={APPROVAL_STATUS} value={a.status} /> },
    {
      key: "action",
      header: <span className="sr-only">Action</span>,
      align: "right",
      cell: (a) => (
        <Button asChild size="sm" variant={a.canDecide ? "default" : "ghost"}>
          <Link href={`/approvals/${a.id}`}>{a.canDecide ? "Review" : "View"}</Link>
        </Button>
      ),
    },
  ];

  const tabs = [
    ...(canDecideAny || awaiting.total > 0 ? [{ key: "awaiting" as const, label: "Awaiting my decision", count: awaiting.total }] : []),
    { key: "mine" as const, label: "My requests", count: mine.total },
    { key: "all" as const, label: can(user, "approvals.read.all") ? "All requests" : "All visible" },
  ];

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Formal sign-off for expenses, purchases, contracts, campaigns, releases and strategic decisions. Every decision is recorded."
        actions={
          can(user, "approvals.submit") && (
            <FormDialog
              title="Submit for approval"
              description="Approvers are notified immediately. You cannot approve your own request."
              size="lg"
              trigger={
                <Button>
                  <PlusIcon /> Submit for approval
                </Button>
              }
              openParam="approval"
              action={createApprovalAction}
              fields={fields}
              defaultValues={{ type: "EXPENSE", priority: "MEDIUM" }}
              submitLabel="Submit request"
              successHref="/approvals/{id}"
            />
          )
        }
      />
      <LinkTabs
        className="mb-4"
        tabs={tabs.map((t) => ({ label: t.label, count: "count" in t ? t.count : undefined, href: buildHref("/approvals", {}, { scope: t.key === defaultScope ? undefined : t.key }), active: scope === t.key }))}
      />
      <Card className="overflow-hidden">
        <TableToolbar
          searchPlaceholder="Search requests or #number…"
          filters={[
            { param: "status", label: "Status", options: optionsOf(APPROVAL_STATUS) },
            { param: "type", label: "Type", options: optionsOf(APPROVAL_TYPE) },
          ]}
        />
        <DataTable
          columns={columns}
          rows={list.rows}
          total={list.total}
          params={params}
          pathname="/approvals"
          searchParams={sp}
          empty={
            <EmptyState
              icon={CheckCircle2Icon}
              title={scope === "awaiting" ? "No pending approvals" : "No approval requests found"}
              description={scope === "awaiting" ? "Nothing is waiting for your decision right now." : "Requests you submit or can see will appear here."}
            />
          }
        />
      </Card>
    </>
  );
}
