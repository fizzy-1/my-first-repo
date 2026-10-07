"use client";

import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { markNotificationReadAction } from "@/server/actions/notifications";
import type { NotificationItem } from "@/server/services/notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/components/forms/action-button";
import { NOTIFICATION_TYPE } from "@/lib/labels";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const { run, pending } = useServerAction(markNotificationReadAction);
  return (
    <ul className="divide-y divide-border">
      {items.map((n) => {
        const meta = NOTIFICATION_TYPE[n.type];
        return (
          <li key={n.id} className={cn("flex gap-4 px-5 py-4", !n.readAt && "bg-primary-soft/30")}>
            <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={meta.tone}>{meta.label}</Badge>
                <span className="text-xs text-muted-foreground" title={formatDateTime(n.createdAt)}>
                  {formatRelative(n.createdAt)}
                </span>
                {!n.readAt && <span className="sr-only">Unread</span>}
              </div>
              <p className="mt-1.5 text-sm font-medium">
                {n.link ? (
                  <Link href={n.link} className="hover:underline" onClick={() => !n.readAt && run({ ids: [n.id] }, { silent: true })}>
                    {n.title}
                  </Link>
                ) : (
                  n.title
                )}
              </p>
              {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
            </div>
            {!n.readAt && (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => run({ ids: [n.id] }, { silent: true })} aria-label="Mark as read">
                <CheckIcon /> <span className="hidden sm:inline">Mark read</span>
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
