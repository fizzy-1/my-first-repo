import type { Permission } from "@/lib/rbac";

/** Administration sub-pages in navigation order, each behind its own permission. */
export const ADMIN_SECTIONS: { href: string; label: string; permission: Permission }[] = [
  { href: "/admin/users", label: "Users", permission: "admin.users" },
  { href: "/admin/roles", label: "Roles & permissions", permission: "admin.roles" },
  { href: "/admin/audit", label: "Audit log", permission: "audit.read" },
  { href: "/admin/announcements", label: "Announcements", permission: "announcements.write" },
];

export const ADMIN_PERMISSIONS = ADMIN_SECTIONS.map((s) => s.permission);

/** Display names for the `module` values used by permissions and audit entries. */
export const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  intelligence: "Business intelligence",
  finance: "Finance",
  schools: "Schools & partnerships",
  marketing: "Marketing",
  academic: "Academic",
  technology: "Product & technology",
  team: "Team",
  documents: "Documents",
  approvals: "Approvals",
  meetings: "Meetings",
  strategy: "Strategy",
  tasks: "Tasks",
  calendar: "Calendar",
  announcements: "Announcements",
  admin: "Administration",
};

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module.charAt(0).toUpperCase() + module.slice(1);
}
