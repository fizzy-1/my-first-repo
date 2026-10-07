"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface ToolbarFilter {
  param: string;
  label: string;
  options: { value: string; label: string }[];
}

const ALL = "__all__";

/** Search box + filter selects that write to the URL (debounced), resetting to page 1. */
export function TableToolbar({
  searchPlaceholder = "Search…",
  filters = [],
  children,
  className,
  showSearch = true,
}: {
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
  children?: React.ReactNode;
  className?: string;
  showSearch?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [query, setQuery] = React.useState(searchParams.get("q") ?? "");

  const update = React.useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      params.delete("page");
      startTransition(() => router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  React.useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (query === current) return;
    const timer = setTimeout(() => update({ q: query.trim() || null }), 300);
    return () => clearTimeout(timer);
  }, [query, searchParams, update]);

  const activeFilters = filters.filter((f) => searchParams.get(f.param));

  return (
    <div className={cn("flex flex-col gap-2 px-5 py-3 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      {showSearch && (
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-8 text-[13px]"
            aria-label={searchPlaceholder}
          />
          {pending && <Loader2Icon className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
      )}
      {filters.map((filter) => (
        <Select
          key={filter.param}
          value={searchParams.get(filter.param) ?? ALL}
          onValueChange={(value) => update({ [filter.param]: value === ALL ? null : value })}
        >
          <SelectTrigger size="sm" className="w-full sm:w-auto sm:min-w-36" aria-label={filter.label}>
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All {filter.label.toLowerCase()}</SelectItem>
            {filter.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {(activeFilters.length > 0 || searchParams.get("q")) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            update(Object.fromEntries([["q", null], ...filters.map((f) => [f.param, null])]));
          }}
        >
          <XIcon /> Clear
        </Button>
      )}
      {children && <div className="flex items-center gap-2 sm:ml-auto">{children}</div>}
    </div>
  );
}
