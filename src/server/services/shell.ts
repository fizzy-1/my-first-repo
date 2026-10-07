import "server-only";
import type { SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { approvalsAwaitingDecisionWhere } from "./approvals";
import { getNotificationSummary } from "./notifications";

/** Data needed by the persistent application shell (one round trip per navigation). */
export async function getShellData(user: SessionUser) {
  const [notifications, approvals, tasks] = await Promise.all([
    getNotificationSummary(user),
    db.approval.count({ where: approvalsAwaitingDecisionWhere(user) }),
    db.task.count({ where: { assigneeId: user.id, status: { not: "COMPLETED" } } }),
  ]);
  return { notifications, counts: { approvals, tasks, notifications: notifications.unread } };
}
