"use client";

import * as React from "react";
import Link from "next/link";
import { LogOutIcon, MenuIcon, PlusIcon, SearchIcon, ShieldCheckIcon, UserCircleIcon } from "lucide-react";
import { logoutAction } from "@/server/actions/auth";
import type { NotificationItem } from "@/server/services/notifications";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CommandPalette } from "./command-palette";
import { Wordmark } from "./logo";
import { NotificationBell } from "./notification-bell";
import { visibleQuickCreate } from "./quick-create";
import { DesktopSidebar, SidebarNav, type ShellCounts } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

export interface ShellUser {
  name: string;
  email: string;
  roleName: string;
  jobTitle: string | null;
}

export function AppShell({
  user,
  permissions,
  counts,
  notifications,
  sidebarCollapsed,
  demoBadge,
  children,
}: {
  user: ShellUser;
  permissions: string[];
  counts: ShellCounts;
  notifications: { unread: number; items: NotificationItem[] };
  sidebarCollapsed: boolean;
  demoBadge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const quickCreate = visibleQuickCreate(permissions);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <DesktopSidebar permissions={permissions} counts={counts} initialCollapsed={sidebarCollapsed} />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-16 items-center border-b border-sidebar-border px-4">
            <Wordmark />
          </div>
          <SidebarNav permissions={permissions} counts={counts} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:gap-3 sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <MenuIcon />
          </Button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 text-left text-sm text-muted-foreground shadow-xs transition-colors hover:border-input sm:max-w-md"
            aria-label="Search the workspace"
          >
            <SearchIcon className="size-4 shrink-0" />
            <span className="truncate">Search the workspace…</span>
            <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 font-sans text-[10px] font-medium sm:inline">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {demoBadge}
            {quickCreate.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-9" aria-label="Quick create">
                    <PlusIcon />
                    <span className="hidden sm:inline">Create</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Quick create</DropdownMenuLabel>
                  {quickCreate.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href}>
                        <item.icon />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <ThemeToggle />
            <NotificationBell initialUnread={notifications.unread} initialItems={notifications.items} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-accent sm:pr-2"
                  aria-label="Account menu"
                >
                  <Avatar name={user.name} />
                  <span className="hidden min-w-0 flex-col text-left leading-tight xl:flex">
                    <span className="truncate text-[13px] font-medium">{user.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{user.roleName}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <div className="px-2 py-2">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-primary-soft px-1.5 py-0.5 text-[11px] font-medium text-primary-soft-foreground">
                    <ShieldCheckIcon className="size-3" /> {user.roleName}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <UserCircleIcon /> Profile & security
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <form action={logoutAction}>
                  <DropdownMenuItem asChild>
                    <button type="submit" className="w-full">
                      <LogOutIcon /> Log out
                    </button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} permissions={permissions} />
    </div>
  );
}
