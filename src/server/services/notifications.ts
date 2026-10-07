import "server-only";
import type { NotificationType } from "@prisma/client";
import type { SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function toItem(n: {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationItem {
  return { ...n, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() };
}

/** Notifications are always scoped to their recipient — no permission can widen this. */
export async function getNotificationSummary(user: SessionUser, take = 8) {
  const [unread, items] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take }),
  ]);
  return { unread, items: items.map(toItem) };
}

export async function listNotifications(
  user: SessionUser,
  opts: { filter?: "unread" | "all"; type?: NotificationType; skip: number; take: number },
) {
  const where = {
    userId: user.id,
    ...(opts.filter === "unread" ? { readAt: null } : {}),
    ...(opts.type ? { type: opts.type } : {}),
  };
  const [total, items] = await Promise.all([
    db.notification.count({ where }),
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: opts.skip, take: opts.take }),
  ]);
  return { total, items: items.map(toItem) };
}

export async function markNotificationsRead(user: SessionUser, ids: string[] | "all") {
  const result = await db.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
  return result.count;
}
