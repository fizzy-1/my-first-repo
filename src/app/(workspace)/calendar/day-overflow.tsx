"use client";

import * as React from "react";
import Link from "next/link";
import { ListIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** "+N more" in a crowded month-grid cell; opens every item for that day. */
export function DayOverflow({
  hidden,
  dayLabel,
  agendaHref,
  children,
}: {
  hidden: number;
  dayLabel: string;
  agendaHref: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Show ${hidden} more on ${dayLabel}`}
          className="w-full rounded-md px-1.5 py-0.5 text-left text-[11px] leading-4 font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          +{hidden} more
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-3">
        <p className="mb-2 text-xs font-semibold">{dayLabel}</p>
        <div className="max-h-72 space-y-1 overflow-y-auto">{children}</div>
        <Link
          href={agendaHref}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary-soft-foreground hover:underline"
        >
          <ListIcon className="size-3.5" /> Open in agenda
        </Link>
      </PopoverContent>
    </Popover>
  );
}
