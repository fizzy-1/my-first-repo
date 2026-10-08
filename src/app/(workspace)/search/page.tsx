import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import {
  ArrowRightIcon,
  BugIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  FileTextIcon,
  FolderKanbanIcon,
  ListTodoIcon,
  MegaphoneIcon,
  SchoolIcon,
  SearchIcon,
  SearchXIcon,
  UserIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import { can, canAny, requireUser, type SessionUser } from "@/server/auth/current-user";
import { globalSearch } from "@/server/services/search";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { first } from "@/lib/list-params";
import { Highlight } from "./highlight";

const PER_CATEGORY = 25;
const MIN_QUERY = 2;
const MAX_QUERY = 100;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  People: UserIcon,
  Tasks: ListTodoIcon,
  Projects: FolderKanbanIcon,
  Schools: SchoolIcon,
  Documents: FileTextIcon,
  Meetings: CalendarIcon,
  Approvals: CheckCircle2Icon,
  "Financial records": WalletIcon,
  Campaigns: MegaphoneIcon,
  Bugs: BugIcon,
};

/** Module list pages that accept the same query, for filtering a category further. */
const MODULE_LINKS: Record<string, { label: string; href: (q: string) => string }[]> = {
  People: [{ label: "Open in Team", href: (q) => `/team?q=${encodeURIComponent(q)}` }],
  Tasks: [{ label: "Open in Tasks", href: (q) => `/tasks?scope=all&q=${encodeURIComponent(q)}` }],
  Schools: [{ label: "Open in Schools", href: (q) => `/schools?q=${encodeURIComponent(q)}` }],
  Documents: [{ label: "Open in Documents", href: (q) => `/documents?q=${encodeURIComponent(q)}` }],
  Approvals: [{ label: "Open in Approvals", href: (q) => `/approvals?scope=all&q=${encodeURIComponent(q)}` }],
  "Financial records": [
    { label: "Income", href: (q) => `/finance/income?q=${encodeURIComponent(q)}` },
    { label: "Expenses", href: (q) => `/finance/expenses?q=${encodeURIComponent(q)}` },
  ],
  Campaigns: [{ label: "Open in Marketing", href: (q) => `/marketing?q=${encodeURIComponent(q)}` }],
  Bugs: [{ label: "Open in Bugs", href: (q) => `/technology/bugs?q=${encodeURIComponent(q)}` }],
};

/** What this user's searches cover, mirroring the category gates in globalSearch (for the hint text only). */
function searchableAreas(user: SessionUser): string {
  const areas = [
    can(user, "team.read") && "people",
    "tasks",
    "projects",
    can(user, "schools.read") && "schools",
    can(user, "documents.read") && "documents",
    "meetings",
    "approvals",
    can(user, "finance.read") && "income and expenses",
    canAny(user, ["marketing.read", "marketing.read.assigned"]) && "campaigns",
    canAny(user, ["technology.read", "technology.read.assigned"]) && "bugs",
  ].filter((a): a is string => !!a);
  return `${areas.slice(0, -1).join(", ")} and ${areas[areas.length - 1]}`;
}

function readQuery(sp: Record<string, string | string[] | undefined>) {
  return (first(sp.q) ?? "").trim().slice(0, MAX_QUERY);
}

function slug(category: string) {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export async function generateMetadata(props: PageProps<"/search">): Promise<Metadata> {
  const q = readQuery(await props.searchParams);
  return { title: q ? `Search: ${q}` : "Search" };
}

export default async function SearchPage(props: PageProps<"/search">) {
  const user = await requireUser();
  const q = readQuery(await props.searchParams);
  const groups = q.length >= MIN_QUERY ? await globalSearch(user, q, PER_CATEGORY) : [];
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  const anyCapped = groups.some((g) => g.items.length >= PER_CATEGORY);
  // "#42" also matches records numbered 42, whose subtitles show the bare number.
  const terms = /^#\d+$/.test(q) ? [q, q.slice(1)] : [q];

  return (
    <>
      <PageHeader title="Search" description="Find people, records and documents across the workspace. Results only include what you have access to." />

      <Form action="/search" role="search" className="mb-6 flex max-w-2xl gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            key={q}
            name="q"
            type="search"
            defaultValue={q}
            maxLength={MAX_QUERY}
            autoFocus={!q}
            autoComplete="off"
            placeholder="Search people, tasks, schools, documents…"
            aria-label="Search the workspace"
            className="h-10 pl-9"
          />
        </div>
        <Button type="submit" className="h-10">
          Search
        </Button>
      </Form>

      {q.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchIcon}
            title="Search the workspace"
            description={`Search ${searchableAreas(user)}. Tasks, approvals and bugs can also be found by number, for example #42.`}
            action={
              <p className="text-xs text-muted-foreground">
                Tip: press{" "}
                <kbd className="rounded border border-border bg-muted px-1.5 font-sans text-[11px] font-medium">⌘K</kbd> or{" "}
                <kbd className="rounded border border-border bg-muted px-1.5 font-sans text-[11px] font-medium">Ctrl K</kbd> anywhere to search
                without leaving the page.
              </p>
            }
          />
        </Card>
      ) : q.length < MIN_QUERY ? (
        <Card>
          <EmptyState icon={SearchIcon} title="Keep typing" description={`Search needs at least ${MIN_QUERY} characters.`} />
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchXIcon}
            title={`No results for “${q}”`}
            description="Check the spelling, try a shorter or different word, or search by number (for example #42). Results only include records you have access to."
          />
        </Card>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground" role="status">
            <span className="tabular font-medium text-foreground">
              {total}
              {anyCapped && "+"}
            </span>{" "}
            result{total === 1 ? "" : "s"} for “<span className="text-foreground">{q}</span>” in {groups.length} {groups.length === 1 ? "category" : "categories"}
          </p>

          {groups.length > 1 && (
            <nav aria-label="Jump to category" className="scrollbar-none -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              {groups.map((group) => {
                const Icon = CATEGORY_ICONS[group.category] ?? SearchIcon;
                return (
                  <a
                    key={group.category}
                    href={`#results-${slug(group.category)}`}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-medium text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon aria-hidden className="size-3.5" />
                    {group.category}
                    <span className="tabular rounded-full bg-muted px-1.5 text-[11px] leading-5">
                      {group.items.length}
                      {group.items.length >= PER_CATEGORY && "+"}
                    </span>
                  </a>
                );
              })}
            </nav>
          )}

          <div className="space-y-5">
            {groups.map((group) => {
              const Icon = CATEGORY_ICONS[group.category] ?? SearchIcon;
              const id = `results-${slug(group.category)}`;
              const capped = group.items.length >= PER_CATEGORY;
              const links = MODULE_LINKS[group.category] ?? [];
              return (
                <section key={group.category} id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
                  <Card className="overflow-hidden">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                          <Icon className="size-4" />
                        </span>
                        <h2 id={`${id}-heading`} className="text-[15px] font-semibold tracking-tight">
                          {group.category}
                        </h2>
                        <span className="tabular rounded-full bg-muted px-2 text-xs leading-5 text-muted-foreground">
                          {group.items.length}
                          {capped && "+"}
                        </span>
                      </div>
                      {links.length > 0 && (
                        <div className="ml-auto flex items-center gap-3">
                          {links.map((link) => (
                            <Link key={link.label} href={link.href(q)} className="inline-flex items-center gap-1 text-xs font-medium text-primary-soft-foreground hover:underline">
                              {link.label} <ArrowRightIcon aria-hidden className="size-3" />
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                    <ul className="divide-y divide-border">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <Link href={item.href} className="flex items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-accent/50 focus-visible:bg-accent/50 sm:px-5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                <Highlight text={item.title} terms={terms} />
                              </p>
                              {item.subtitle && (
                                <p className="truncate text-xs text-muted-foreground">
                                  <Highlight text={item.subtitle} terms={terms} />
                                </p>
                              )}
                            </div>
                            <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {capped && (
                      <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
                        Showing the first {PER_CATEGORY} matches. {links.length > 0 ? "Open the module to filter and sort the rest." : "Refine your search to narrow them down."}
                      </p>
                    )}
                  </Card>
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
