"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellIcon, LogOutIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, UserCircleIcon } from "lucide-react";
import { logoutAction } from "@/server/actions/auth";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Wordmark } from "./logo";
import { visibleNav } from "./nav";

export interface ShellCounts {
  approvals: number;
  tasks: number;
  notifications: number;
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-sidebar-active text-sidebar-active-foreground"
          : "text-sidebar-foreground hover:bg-accent/70 hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      {active && <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r-full bg-primary" />}
      <Icon className={cn("size-[18px] shrink-0", active ? "text-sidebar-active-foreground" : "opacity-80")} />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            "tabular inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] leading-5 font-semibold text-primary-foreground",
            collapsed && "absolute top-0.5 right-0.5 min-w-4 px-1 text-[9px] leading-4",
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
  return collapsed ? (
    <Tooltip content={label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

export function SidebarNav({
  permissions,
  counts,
  collapsed = false,
  onNavigate,
}: {
  permissions: string[];
  counts: ShellCounts;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = visibleNav(permissions);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground/80 uppercase">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={isActive(item.href)}
                    collapsed={collapsed}
                    badge={item.badgeKey ? counts[item.badgeKey] : undefined}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-sidebar-border px-3 py-3">
        <NavLink href="/profile" label="Profile" icon={UserCircleIcon} active={isActive("/profile")} collapsed={collapsed} onNavigate={onNavigate} />
        <NavLink
          href="/notifications"
          label="Notifications"
          icon={BellIcon}
          active={isActive("/notifications")}
          collapsed={collapsed}
          badge={counts.notifications}
          onNavigate={onNavigate}
        />
        <form action={logoutAction}>
          <button
            type="submit"
            className={cn(
              "flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-accent/70 hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
            aria-label="Log out"
          >
            <LogOutIcon className="size-[18px] opacity-80" />
            {!collapsed && <span>Log out</span>}
          </button>
        </form>
      </div>
    </div>
  );
}

export function DesktopSidebar({
  permissions,
  counts,
  initialCollapsed,
}: {
  permissions: string[];
  counts: ShellCounts;
  initialCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `ia_sidebar=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center border-b border-sidebar-border px-4", collapsed && "justify-center px-0")}>
        <Link href="/dashboard" aria-label="Integral Academy — Executive Dashboard">
          <Wordmark collapsed={collapsed} />
        </Link>
      </div>
      <SidebarNav permissions={permissions} counts={counts} collapsed={collapsed} />
      <button
        type="button"
        onClick={toggle}
        className="mx-3 mb-3 flex h-8 items-center justify-center gap-2 rounded-lg text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <PanelLeftOpenIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}
