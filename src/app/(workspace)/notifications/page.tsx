import type { Metadata } from "next";
import { BellOffIcon, CheckCheckIcon } from "lucide-react";
import { NotificationType } from "@prisma/client";
import { markAllNotificationsReadAction } from "@/server/actions/notifications";
import { requireUser } from "@/server/auth/current-user";
import { listNotifications } from "@/server/services/notifications";
import { Pagination } from "@/components/data-table/data-table";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { ActionButton } from "@/components/forms/action-button";
import { Card } from "@/components/ui/card";
import { NOTIFICATION_TYPE, optionsOf } from "@/lib/labels";
import { buildHref, oneOf, parseListParams } from "@/lib/list-params";
import { NotificationList } from "./notification-list";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage(props: PageProps<"/notifications">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const params = parseListParams(sp, { sortable: ["createdAt"] as const, defaultSort: "createdAt", pageSize: 25 });
  const filter = params.filter("view") === "all" ? "all" : "unread";
  const type = oneOf<NotificationType>(params.filter("type"), NotificationType);
  const [{ total, items }, unread] = await Promise.all([
    listNotifications(user, { filter, type, skip: params.skip, take: params.pageSize }),
    listNotifications(user, { filter: "unread", skip: 0, take: 0 }),
  ]);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Assignments, approvals, deadlines, documents, meeting invitations and announcements."
        actions={
          unread.total > 0 && (
            <ActionButton action={markAllNotificationsReadAction} input={{}} variant="outline">
              <CheckCheckIcon /> Mark all as read
            </ActionButton>
          )
        }
      />
      <LinkTabs
        className="mb-4"
        tabs={[
          { label: "Unread", count: unread.total, href: buildHref("/notifications", {}, {}), active: filter === "unread" },
          { label: "All", href: buildHref("/notifications", {}, { view: "all" }), active: filter === "all" },
        ]}
      />
      <Card className="overflow-hidden">
        <TableToolbar showSearch={false} filters={[{ param: "type", label: "Type", options: optionsOf(NOTIFICATION_TYPE) }]} />
        {items.length === 0 ? (
          <EmptyState
            icon={BellOffIcon}
            title={filter === "unread" ? "You're all caught up" : "No notifications"}
            description={filter === "unread" ? "New notifications will appear here." : undefined}
          />
        ) : (
          <NotificationList items={items} />
        )}
        <Pagination total={total} params={params} pathname="/notifications" searchParams={sp} />
      </Card>
    </>
  );
}
