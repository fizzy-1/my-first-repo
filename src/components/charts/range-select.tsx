"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { RANGE_OPTIONS, type RangeKey } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Segmented date-range control; writes ?range= and scopes every chart below it. */
export function RangeSelect({ value, param = "range" }: { value: RangeKey; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [optimistic, setOptimistic] = React.useOptimistic(value);

  const select = (next: RangeKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(param, next);
    startTransition(() => {
      setOptimistic(next);
      router.replace(`${pathname}?${params}`, { scroll: false });
    });
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-lg border border-border bg-card p-0.5 shadow-xs" role="radiogroup" aria-label="Date range">
        {RANGE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={optimistic === o.value}
            onClick={() => select(o.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              optimistic === o.value && "bg-primary text-primary-foreground hover:text-primary-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {pending && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
    </div>
  );
}
