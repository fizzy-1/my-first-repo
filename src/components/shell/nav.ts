import type { LucideIcon } from "lucide-react";
import {
  BarChart3Icon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  CpuIcon,
  FolderOpenIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  MegaphoneIcon,
  NotebookPenIcon,
  SchoolIcon,
  SettingsIcon,
  TargetIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import type { Permission } from "@/lib/rbac";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Visible when the user holds ANY of these (empty = everyone). */
  anyOf: Permission[];
  badgeKey?: "approvals" | "tasks";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Executive Dashboard", icon: LayoutDashboardIcon, anyOf: [] },
      { href: "/intelligence", label: "Business Intelligence", icon: BarChart3Icon, anyOf: ["intelligence.read"] },
      { href: "/tasks", label: "Tasks", icon: ListTodoIcon, anyOf: [], badgeKey: "tasks" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/finance", label: "Finance", icon: WalletIcon, anyOf: ["finance.read"] },
      { href: "/schools", label: "Schools & Partnerships", icon: SchoolIcon, anyOf: ["schools.read"] },
      { href: "/marketing", label: "Marketing", icon: MegaphoneIcon, anyOf: ["marketing.read", "marketing.read.assigned"] },
      { href: "/academic", label: "Academic", icon: GraduationCapIcon, anyOf: ["academic.read", "academic.read.assigned"] },
      { href: "/technology", label: "Product & Technology", icon: CpuIcon, anyOf: ["technology.read", "technology.read.assigned"] },
      { href: "/team", label: "Team", icon: UsersIcon, anyOf: ["team.read"] },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/documents", label: "Documents", icon: FolderOpenIcon, anyOf: ["documents.read"] },
      { href: "/calendar", label: "Calendar", icon: CalendarDaysIcon, anyOf: ["calendar.read"] },
      { href: "/approvals", label: "Approvals", icon: CheckCircle2Icon, anyOf: [], badgeKey: "approvals" },
      { href: "/meetings", label: "Meetings", icon: NotebookPenIcon, anyOf: [] },
      { href: "/strategy", label: "Strategy", icon: TargetIcon, anyOf: ["strategy.read"] },
    ],
  },
  {
    label: "Administration",
    items: [{ href: "/admin", label: "Administration", icon: SettingsIcon, anyOf: ["admin.users", "admin.roles", "audit.read", "announcements.write"] }],
  },
];

export function visibleNav(permissions: readonly string[]): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.anyOf.length === 0 || item.anyOf.some((p) => permissions.includes(p))),
  })).filter((group) => group.items.length > 0);
}
