"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BugIcon,
  CalendarIcon,
  CheckCircle2Icon,
  FileTextIcon,
  ListTodoIcon,
  Loader2Icon,
  MegaphoneIcon,
  SchoolIcon,
  SearchIcon,
  UserIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { visibleNav } from "./nav";
import { visibleQuickCreate } from "./quick-create";

export interface SearchResultGroup {
  category: string;
  items: { id: string; title: string; subtitle?: string; href: string }[];
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  People: UserIcon,
  Tasks: ListTodoIcon,
  Schools: SchoolIcon,
  Documents: FileTextIcon,
  Meetings: CalendarIcon,
  Projects: ListTodoIcon,
  Approvals: CheckCircle2Icon,
  "Financial records": WalletIcon,
  Campaigns: MegaphoneIcon,
  Bugs: BugIcon,
};

export function CommandPalette({
  open,
  onOpenChange,
  permissions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permissions: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResultGroup[]>([]);
  const [loading, setLoading] = React.useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery("");
      setResults([]);
    }
    onOpenChange(next);
  };

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) setResults(((await res.json()) as { groups: SearchResultGroup[] }).groups);
      } catch {
        // aborted
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const go = (href: string) => {
    handleOpenChange(false);
    router.push(href);
  };

  const nav = visibleNav(permissions).flatMap((g) => g.items);
  const create = visibleQuickCreate(permissions);
  const q = query.trim().toLowerCase();
  // Server results only apply to queries of 2+ characters.
  const visibleResults = q.length >= 2 ? results : [];
  const isLoading = q.length >= 2 && loading;
  const navMatches = nav.filter((item) => !q || item.label.toLowerCase().includes(q));
  const createMatches = create.filter((item) => !q || item.label.toLowerCase().includes(q));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="lg" className="overflow-hidden p-0 sm:top-[12%] sm:translate-y-0">
        <DialogTitle className="sr-only">Search the workspace</DialogTitle>
        <Command shouldFilter={false} loop>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search people, tasks, schools, documents, meetings, finance…"
          />
          <CommandList>
            {isLoading && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" /> Searching…
              </div>
            )}
            {!isLoading && q.length >= 2 && visibleResults.length === 0 && navMatches.length === 0 && createMatches.length === 0 && (
              <CommandEmpty>No results for “{query}”.</CommandEmpty>
            )}
            {visibleResults.map((group) => {
              const Icon = CATEGORY_ICONS[group.category] ?? SearchIcon;
              return (
                <CommandGroup key={group.category} heading={group.category}>
                  {group.items.map((item) => (
                    <CommandItem key={`${group.category}-${item.id}`} value={`${group.category}-${item.id}`} onSelect={() => go(item.href)}>
                      <Icon />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.title}</span>
                        {item.subtitle && <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
            {createMatches.length > 0 && (
              <CommandGroup heading="Create">
                {createMatches.map((item) => (
                  <CommandItem key={item.href} value={`create-${item.href}`} onSelect={() => go(item.href)}>
                    <item.icon />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {navMatches.length > 0 && (
              <CommandGroup heading="Go to">
                {navMatches.map((item) => (
                  <CommandItem key={item.href} value={`nav-${item.href}`} onSelect={() => go(item.href)}>
                    <item.icon />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
            <span>
              Results are limited to records you have access to.
            </span>
            <button type="button" className="hover:text-foreground" onClick={() => go(`/search?q=${encodeURIComponent(query)}`)}>
              See all results ↵
            </button>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
