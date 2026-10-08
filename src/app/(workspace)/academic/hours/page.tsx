import type { Metadata } from "next";
import { ClockIcon, PlusIcon } from "lucide-react";
import { TimeEntryStatus } from "@prisma/client";
import { deleteTimeEntryAction, logTimeAction } from "@/server/actions/academic";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { listTimeEntries, myContentOptions, myTutorProfile } from "@/server/services/academic";
import { Pagination } from "@/components/data-table/data-table";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { FormDialog } from "@/components/forms/form-dialog";
import { RowMenu } from "@/components/forms/row-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toDateInput } from "@/lib/dates";
import { optionsOf, TIME_ENTRY_STATUS, TUTOR_ACTIVITY } from "@/lib/labels";
import { formatDate, formatHours } from "@/lib/format";
import { buildHref, oneOf, parseListParams } from "@/lib/list-params";
import { ApprovalTable } from "./approval-table";

export const metadata: Metadata = { title: "Tutor hours" };

export default async function HoursPage(props: PageProps<"/academic/hours">) {
  const user = await requirePageAccess("academic.read", "academic.read.assigned");
  const sp = await props.searchParams;
  const params = parseListParams(sp, { sortable: ["date"] as const, defaultSort: "date", pageSize: 30 });
  const canApprove = can(user, "academic.hours.approve");
  const profile = await myTutorProfile(user);
  const canLog = can(user, "academic.hours.log") && !!profile;
  // Approvers land on their queue; everyone else on their own entries.
  const requested = params.filter("tab");
  const tab = canApprove && (requested === "approvals" || requested === "all") ? requested : canApprove && requested !== "mine" ? "approvals" : "mine";

  const [entries, pending, contentOptions] = await Promise.all([
    listTimeEntries(user, { mine: tab === "mine", status: oneOf<TimeEntryStatus>(params.filter("status"), TimeEntryStatus), skip: params.skip, take: params.pageSize }),
    canApprove ? listTimeEntries(user, { status: "SUBMITTED", skip: 0, take: 200 }) : Promise.resolve(null),
    canLog ? myContentOptions(user) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Tutor hours"
        description="Log recording, editing, live classes and marking time. The Head Tutor approves hours before they are paid."
        actions={
          canLog && (
            <FormDialog
              title="Log hours"
              trigger={
                <Button>
                  <PlusIcon /> Log hours
                </Button>
              }
              openParam="hours"
              action={logTimeAction}
              fields={[
                { type: "date", name: "date", label: "Date", required: true },
                { type: "number", name: "hours", label: "Hours", required: true, min: 0.25, max: 24, step: 0.25 },
                { type: "select", name: "activity", label: "Activity", required: true, options: optionsOf(TUTOR_ACTIVITY), span: 2 },
                { type: "select", name: "contentItemId", label: "Content item", options: contentOptions, emptyLabel: "Not linked", span: 2 },
                { type: "textarea", name: "description", label: "Notes", rows: 2 },
              ]}
              defaultValues={{ date: toDateInput(new Date()), activity: "RECORDING" }}
              submitLabel="Log hours"
            />
          )
        }
      />
      <LinkTabs
        className="mb-4"
        tabs={[
          ...(canApprove
            ? [
                { label: "Awaiting approval", href: buildHref("/academic/hours", {}, {}), active: tab === "approvals", count: pending?.total ?? 0 },
                { label: "All entries", href: buildHref("/academic/hours", {}, { tab: "all" }), active: tab === "all" },
              ]
            : []),
          ...(profile || !canApprove ? [{ label: "My hours", href: buildHref("/academic/hours", {}, canApprove ? { tab: "mine" } : {}), active: tab === "mine" }] : []),
        ]}
      />
      {tab === "approvals" && pending ? (
        <Card className="overflow-hidden">
          <ApprovalTable
            entries={pending.rows
              .filter((r) => !r.isMine)
              .map((r) => ({ id: r.id, tutor: r.tutor.user.name, date: formatDate(r.date), hours: r.hours, activity: r.activity, description: r.description, content: r.contentItem?.title ?? null }))}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <TableToolbar showSearch={false} filters={[{ param: "status", label: "Status", options: optionsOf(TIME_ENTRY_STATUS) }]}>
            <span className="tabular text-xs text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{formatHours(entries.totalHours)}</span>
            </span>
          </TableToolbar>
          {entries.rows.length === 0 ? (
            <EmptyState icon={ClockIcon} title="No hours logged" description={canLog ? "Log your first entry with “Log hours”." : undefined} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {tab === "all" && <TableHead>Tutor</TableHead>}
                  <TableHead>Date</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead className="hidden md:table-cell">Details</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Reviewed by</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.rows.map((e) => (
                  <TableRow key={e.id}>
                    {tab === "all" && <TableCell className="font-medium">{e.tutor.user.name}</TableCell>}
                    <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                    <TableCell>
                      <StatusBadge meta={TUTOR_ACTIVITY} value={e.activity} dot={false} />
                    </TableCell>
                    <TableCell className="hidden max-w-96 truncate text-xs text-muted-foreground md:table-cell">{e.contentItem?.title ?? e.description ?? "—"}</TableCell>
                    <TableCell className="tabular text-right font-medium">{e.hours}h</TableCell>
                    <TableCell>
                      <StatusBadge meta={TIME_ENTRY_STATUS} value={e.status} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{e.approvedBy?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {e.isMine && e.status === "SUBMITTED" && (
                        <RowMenu label="time entry" remove={{ action: deleteTimeEntryAction, input: { id: e.id }, title: "Delete this entry?", description: "Only entries that haven't been reviewed can be deleted." }} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Pagination total={entries.total} params={params} pathname="/academic/hours" searchParams={sp} />
        </Card>
      )}
    </>
  );
}
