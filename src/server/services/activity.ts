import "server-only";
import type { Prisma } from "@prisma/client";
import type { Permission } from "@/lib/rbac";
import { canAny, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";

/** Which permission unlocks each module's entries in the Recent Activity feed. */
const FEED_MODULES: Record<string, Permission[]> = {
  finance: ["finance.read"],
  schools: ["schools.read"],
  marketing: ["marketing.read"],
  academic: ["academic.read"],
  technology: ["technology.read"],
  documents: ["documents.read"],
  approvals: ["approvals.read.all"],
  tasks: ["dashboard.executive"],
  meetings: ["meetings.read.all"],
  strategy: ["strategy.read"],
  intelligence: ["dashboard.executive"],
  team: ["team.read"],
  admin: ["audit.read"],
};

export function feedWhere(user: SessionUser): Prisma.AuditLogWhereInput {
  const modules = Object.entries(FEED_MODULES)
    .filter(([, perms]) => canAny(user, perms))
    .map(([module]) => module);
  return { feed: true, module: { in: modules } };
}

export async function recentActivity(user: SessionUser, take = 12) {
  const rows = await db.auditLog.findMany({
    where: feedWhere(user),
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, module: true, summary: true, createdAt: true, actor: { select: { name: true } } },
  });
  return rows;
}
