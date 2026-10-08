import type { Metadata } from "next";
import { MegaphoneIcon, PlusIcon } from "lucide-react";
import { createAnnouncementAction, deleteAnnouncementAction, expireAnnouncementAction, updateAnnouncementAction } from "@/server/actions/admin";
import { requirePageAccess } from "@/server/auth/current-user";
import { listAnnouncements, type AnnouncementState } from "@/server/services/admin";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { FormDialog } from "@/components/forms/form-dialog";
import { RowMenu } from "@/components/forms/row-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ANNOUNCEMENT_LEVEL, type EnumMeta } from "@/lib/labels";
import { formatDateTime, formatRelative } from "@/lib/format";
import { buildHref, oneOf, parseListParams } from "@/lib/list-params";
import { announcementDefaults, announcementFields } from "./fields";

export const metadata: Metadata = { title: "Announcements" };

const STATES = ["live", "scheduled", "expired"] as const satisfies readonly AnnouncementState[];

const STATE_META: Record<AnnouncementState, EnumMeta> = {
  live: { label: "Live", tone: "success" },
  scheduled: { label: "Scheduled", tone: "info" },
  expired: { label: "Expired", tone: "outline" },
};

export default async function AnnouncementsPage(props: PageProps<"/admin/announcements">) {
  const user = await requirePageAccess("announcements.write");
  const sp = await props.searchParams;
  const params = parseListParams(sp, { sortable: ["publishedAt"] as const, defaultSort: "publishedAt", pageSize: 20 });
  const state = oneOf<AnnouncementState>(params.filter("state"), STATES);
  const list = await listAnnouncements(user, { state, skip: params.skip, take: params.pageSize });
  const now = new Date();
  const editFields = announcementFields({ isEdit: true });

  const columns: Column<(typeof list.rows)[number]>[] = [
    {
      key: "title",
      header: "Announcement",
      cell: (a) => (
        <div className="max-w-xl min-w-0 md:min-w-56">
          <p className="font-medium">{a.title}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
          <StatusBadge meta={ANNOUNCEMENT_LEVEL} value={a.level} dot={false} className="mt-1.5 md:hidden" />
        </div>
      ),
    },
    { key: "level", header: "Level", hideOnMobile: true, cell: (a) => <StatusBadge meta={ANNOUNCEMENT_LEVEL} value={a.level} dot={false} /> },
    { key: "state", header: "Status", cell: (a) => <StatusBadge meta={STATE_META} value={a.state} /> },
    {
      key: "window",
      header: "Showing",
      hideOnMobile: true,
      cell: (a) => (
        <div className="text-xs whitespace-nowrap">
          <p title={formatDateTime(a.publishedAt)}>
            {a.state === "scheduled" ? "From " : "Since "}
            {formatDateTime(a.publishedAt)}
          </p>
          <p className="text-muted-foreground" title={a.expiresAt ? formatDateTime(a.expiresAt) : undefined}>
            {a.expiresAt ? `${a.state === "expired" ? "Ended" : "Until"} ${formatDateTime(a.expiresAt)}` : "No expiry"}
          </p>
        </div>
      ),
    },
    {
      key: "author",
      header: "Author",
      hideOnMobile: true,
      cell: (a) => (
        <div className="text-xs whitespace-nowrap">
          <p className="text-sm">{a.author.name}</p>
          <p className="text-muted-foreground">{formatRelative(a.createdAt, now)}</p>
        </div>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (a) => (
        <RowMenu
          label={`announcement “${a.title}”`}
          edit={{
            title: "Edit announcement",
            size: "lg",
            action: updateAnnouncementAction,
            fields: [{ type: "hidden", name: "id", value: a.id }, ...editFields],
            defaults: announcementDefaults(a),
          }}
          items={
            a.state === "live"
              ? [
                  {
                    label: "Expire now",
                    icon: "archive",
                    action: expireAnnouncementAction,
                    input: { id: a.id },
                    confirm: {
                      title: `Take down “${a.title}”?`,
                      description: "It disappears from everyone's dashboard immediately. You can edit it later to show it again.",
                      confirmLabel: "Expire now",
                      destructive: false,
                    },
                  },
                ]
              : []
          }
          remove={{
            action: deleteAnnouncementAction,
            input: { id: a.id },
            title: `Delete “${a.title}”?`,
            description: "The announcement is removed permanently. Expiring it instead keeps a record.",
          }}
        />
      ),
    },
  ];

  const tab = (label: string, value: AnnouncementState | undefined, count: number) => ({
    label,
    href: buildHref("/admin/announcements", {}, { state: value }),
    active: state === value,
    count,
  });

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Company-wide notices. The three most recent live announcements appear at the top of everyone's dashboard."
        actions={
          <FormDialog
            title="New announcement"
            description="Leave the publish time empty to post it right away, or schedule it for later."
            size="lg"
            trigger={
              <Button>
                <PlusIcon /> New announcement
              </Button>
            }
            openParam="announcement"
            action={createAnnouncementAction}
            fields={announcementFields({ isEdit: false })}
            defaultValues={{ level: "INFO" }}
            submitLabel="Publish"
          />
        }
      />
      <LinkTabs
        className="mb-4"
        tabs={[
          tab("All", undefined, list.counts.all),
          tab("Live", "live", list.counts.live),
          tab("Scheduled", "scheduled", list.counts.scheduled),
          tab("Expired", "expired", list.counts.expired),
        ]}
      />
      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={list.rows}
          total={list.total}
          params={params}
          pathname="/admin/announcements"
          searchParams={sp}
          rowClassName={(a) => (a.state === "expired" ? "opacity-70" : undefined)}
          empty={
            <EmptyState
              icon={MegaphoneIcon}
              title={state ? `No ${STATE_META[state].label.toLowerCase()} announcements` : "No announcements yet"}
              description="Use “New announcement” to post one to everyone's dashboard."
            />
          }
        />
      </Card>
    </>
  );
}
