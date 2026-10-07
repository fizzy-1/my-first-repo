"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Section navigation (e.g. Finance › Income / Expenses / Cash flow). */
export function SubNav({ items, className }: { items: { href: string; label: string; exact?: boolean }[]; className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cn("scrollbar-none -mx-4 mb-6 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0", className)} aria-label="Section">
      <ul className="flex gap-1">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-10 items-center px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
