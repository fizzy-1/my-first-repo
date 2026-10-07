"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellIcon, CheckCheckIcon } from "lucide-react";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/server/actions/notifications";
import type { NotificationItem } from "@/server/services/notifications";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NOTIFICATION_TYPE } from "@/lib/labels";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const POLL_MS = 60_000;

export function NotificationBell({ initialUnread, initialItems }: { initialUnread: number; initialItems: NotificationItem[] }) {
  const router = useRouter();
  const [unread, setUnread] = React.useState(initialUnread);
  const [items, setItems] = React.useState(initialItems);
  const [open, setOpen] = React.useState(false);

  // Server re-renders (after actions / navigation) are the source of truth.
  const [serverProps, setServerProps] = React.useState({ initialUnread, initialItems });
  if (serverProps.initialUnread !== initialUnread || serverProps.initialItems !== initialItems) {
    setServerProps({ initialUnread, initialItems });
    setUnread(initialUnread);
    setItems(initialItems);
  }

  React.useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { unread: number; items: NotificationItem[] };
        if (!cancelled) {
          setUnread(data.unread);
          setItems(data.items);
        }
      } catch {
        // Offline or signed out — try again next tick.
      }
    };
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const openItem = async (item: NotificationItem) => {
    setOpen(false);
    if (!item.readAt) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) => list.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)));
      void markNotificationReadAction({ ids: [item.id] });
    }
    if (item.link) router.push(item.link);
  };

  const markAll = async () => {
    setUnread(0);
    setItems((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    await markAllNotificationsReadAction({});
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
          <BellIcon />
          {unread > 0 && (
            <span className="tabular absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] leading-4 font-bold text-white dark:text-[#2a0f12]">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAll} className="h-7 text-xs">
              <CheckCheckIcon /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn(
                      "flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-accent/60",
                      !item.readAt && "bg-primary-soft/40",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.readAt ? "bg-transparent" : "bg-primary")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] leading-snug font-medium">{item.title}</span>
                      {item.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{item.body}</span>}
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {NOTIFICATION_TYPE[item.type].label} · {formatRelative(item.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border p-2">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/notifications" onClick={() => setOpen(false)}>
              Open notification centre
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
