import Link from "next/link";
import { cn } from "@/lib/utils";

/** URL-driven tabs (each tab is a link, so state is shareable and server-rendered). */
export function LinkTabs({
  tabs,
  className,
}: {
  tabs: { label: string; href: string; active: boolean; count?: number }[];
  className?: string;
}) {
  return (
    <nav className={cn("scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1", className)} aria-label="Views">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          scroll={false}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
            tab.active ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={cn(
                "tabular rounded-full px-1.5 text-[11px] leading-5",
                tab.active ? "bg-primary-soft text-primary-soft-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {tab.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
