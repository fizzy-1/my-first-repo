"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** From / to day pickers that write `from` and `to` (YYYY-MM-DD, SAST days) to the URL. */
export function DateRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const update = (changes: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    startTransition(() => router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false }));
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto" aria-busy={pending}>
      <label className="flex flex-1 items-center gap-1.5 text-xs text-muted-foreground sm:flex-none">
        From
        <Input
          key={`from-${from}`}
          type="date"
          defaultValue={from}
          max={to || undefined}
          onChange={(e) => update({ from: e.target.value })}
          className="h-8 w-full text-[13px] sm:w-36"
          aria-label="From date"
        />
      </label>
      <label className="flex flex-1 items-center gap-1.5 text-xs text-muted-foreground sm:flex-none">
        To
        <Input
          key={`to-${to}`}
          type="date"
          defaultValue={to}
          min={from || undefined}
          onChange={(e) => update({ to: e.target.value })}
          className="h-8 w-full text-[13px] sm:w-36"
          aria-label="To date"
        />
      </label>
      {(from || to) && (
        <Button variant="ghost" size="icon-sm" onClick={() => update({ from: "", to: "" })} aria-label="Clear dates">
          <XIcon />
        </Button>
      )}
    </div>
  );
}
