import "server-only";
import type { Permission } from "@/lib/rbac";
import { db } from "@/server/db";

/** Active users whose role grants ANY of the given permissions. */
export async function usersWithPermission(permissions: Permission[]) {
  return db.user.findMany({
    where: {
      status: "ACTIVE",
      role: { permissions: { some: { permission: { key: { in: permissions } } } } },
    },
    select: { id: true, name: true, email: true },
  });
}

/** Lightweight user options for assignee / owner pickers. */
export async function activeUserOptions() {
  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, jobTitle: true, departmentId: true },
  });
  return users.map((u) => ({ value: u.id, label: u.name, hint: u.jobTitle ?? undefined, departmentId: u.departmentId }));
}

export async function departmentOptions() {
  const departments = await db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return departments.map((d) => ({ value: d.id, label: d.name }));
}
