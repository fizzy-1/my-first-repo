import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlusIcon, CalendarXIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { can, canAny, requirePageAccess, type SessionUser } from "@/server/auth/current-user";
import { CALENDAR_KINDS, getCalendarEvents, type CalendarEvent, type CalendarKind } from "@/server/services/calendar";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { APP_TIME_ZONE, addDays, addMonths, dayKey, endOfDay, endOfMonth, monthKey, sastDate, startOfDay, startOfMonth, startOfWeek } from "@/lib/dates";
import { formatDate, formatShortDate } from "@/lib/format";
import { buildHref, first, type SearchParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { AgendaList, type AgendaGroup } from "./agenda-list";
import { KIND_GATES, KIND_ICONS, KIND_ORDER, TONE_CLASSES } from "./kinds";
import { MonthGrid } from "./month-grid";

export const metadata: Metadata = { title: "Calendar" };

const AGENDA_DAYS = 30;
const monthTitleFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: APP_TIME_ZONE });

/** "2026-10" → start of that month in SAST; anything else → null. */
function parseMonth(value: string | undefined): Date | null {
  const match = value ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value) : null;
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 2000 || year > 2100) return null;
  return sastDate(year, Number(match[2]) - 1, 1);
}

/** Kinds this user can ever see, in display order. */
function availableKinds(user: SessionUser): CalendarKind[] {
  return KIND_ORDER.filter((kind) => {
    const gate = KIND_GATES[kind];
    return !gate || canAny(user, gate);
  });
}

function parseKinds(value: string | undefined, available: CalendarKind[]): CalendarKind[] {
  if (!value) return [];
  const requested = new Set(value.split(",").map((k) => k.trim()));
  return available.filter((kind) => requested.has(kind));
}

/** Groups events by SAST day; within a day, all-day items come before timed ones. */
function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = dayKey(new Date(event.at));
    const list = byDay.get(key);
    if (list) list.push(event);
    else byDay.set(key, [event]);
  }
  for (const list of byDay.values()) list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.at.localeCompare(b.at));
  return byDay;
}

function toAgendaGroups(byDay: Map<string, CalendarEvent[]>): AgendaGroup[] {
  return [...byDay.entries()].map(([key, events]) => ({ key, day: startOfDay(new Date(events[0].at)), events }));
}

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const user = await requirePageAccess("calendar.read");
  const sp: SearchParams = await props.searchParams;
  const now = new Date();
  const view = first(sp.view) === "agenda" ? "agenda" : "month";
  const chosenMonth = parseMonth(first(sp.month));
  const anchor = chosenMonth ?? startOfMonth(now);
  // The agenda without a month is a rolling window from today (plus anything overdue).
  const rolling = view === "agenda" && !chosenMonth;
  const month = monthKey(anchor);
  const today = dayKey(now);

  const available = availableKinds(user);
  const selected = parseKinds(first(sp.kinds), available);

  let from: Date;
  let to: Date;
  const weeks: Date[][] = [];
  if (view === "month") {
    from = startOfWeek(anchor);
    const gridEnd = addDays(startOfWeek(startOfDay(endOfMonth(anchor))), 6);
    for (let day = from; day <= gridEnd; day = addDays(day, 1)) {
      if (weeks.length === 0 || weeks[weeks.length - 1].length === 7) weeks.push([]);
      weeks[weeks.length - 1].push(day);
    }
    to = endOfDay(gridEnd);
  } else if (rolling) {
    from = startOfDay(now);
    to = endOfDay(addDays(from, AGENDA_DAYS - 1));
  } else {
    from = anchor;
    to = endOfMonth(anchor);
  }

  // Load every kind once: chip counts need the unfiltered set, and the service caps each source.
  const all = await getCalendarEvents(user, from, to, { includeOverdue: rolling });
  // Counts and lists cover the period itself (the month grid also shows padding days).
  const inPeriod = view === "month" ? all.filter((e) => monthKey(new Date(e.at)) === month) : all;
  const counts = new Map<CalendarKind, number>();
  for (const event of inPeriod) counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
  const matches = (event: CalendarEvent) => selected.length === 0 || selected.includes(event.kind);
  const gridEvents = groupByDay(all.filter(matches));
  const listEvents = inPeriod.filter(matches);

  let groups: AgendaGroup[];
  if (rolling) {
    const overdue = listEvents.filter((e) => new Date(e.at) < from);
    groups = [
      ...(overdue.length ? [{ key: "overdue", day: null, events: overdue }] : []),
      ...toAgendaGroups(groupByDay(listEvents.filter((e) => new Date(e.at) >= from))),
    ];
  } else {
    groups = toAgendaGroups(groupByDay(listEvents));
  }

  const monthTitle = monthTitleFormat.format(anchor);
  const periodPhrase = rolling ? `in the next ${AGENDA_DAYS} days` : `in ${monthTitle}`;
  const href = (overrides: Record<string, string | undefined>) => buildHref("/calendar", sp, overrides);
  const toggleKind = (kind: CalendarKind) => {
    const next = selected.includes(kind) ? selected.filter((k) => k !== kind) : [...selected, kind];
    // Selecting every kind is the same as no filter.
    return href({ kinds: next.length > 0 && next.length < available.length ? KIND_ORDER.filter((k) => next.includes(k)).join(",") : undefined });
  };
  const clearKindsHref = href({ kinds: undefined });

  const empty = (
    <EmptyState
      icon={CalendarXIcon}
      title={selected.length ? "No matching items" : `Nothing scheduled ${periodPhrase}`}
      description={
        selected.length
          ? `None of the selected types fall ${periodPhrase}.`
          : "Meetings, due dates and deadlines from the modules you can access will appear here."
      }
      action={
        selected.length > 0 && (
          <Button asChild variant="outline" size="sm">
            <Link href={clearKindsHref}>Show all types</Link>
          </Button>
        )
      }
    />
  );
  const list = groups.length > 0 ? <AgendaList groups={groups} today={today} tomorrow={dayKey(addDays(now, 1))} /> : empty;

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Meetings, due dates and deadlines from every module you can access, in South African time."
        actions={
          can(user, "meetings.write") && (
            <Button asChild>
              <Link href="/meetings?new=meeting">
                <CalendarPlusIcon /> Schedule meeting
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild variant="outline" size="icon-sm">
            <Link href={href({ month: monthKey(addMonths(anchor, -1)) })} aria-label="Previous month" scroll={false}>
              <ChevronLeftIcon />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={href({ month: undefined })} scroll={false}>
              Today
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon-sm">
            <Link href={href({ month: monthKey(addMonths(anchor, 1)) })} aria-label="Next month" scroll={false}>
              <ChevronRightIcon />
            </Link>
          </Button>
          <h2 className="ml-1 min-w-0 truncate text-lg font-semibold tracking-tight" aria-live="polite">
            {rolling ? (
              <>
                Next {AGENDA_DAYS} days
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {formatShortDate(from)} – {formatDate(addDays(from, AGENDA_DAYS - 1))}
                </span>
              </>
            ) : (
              monthTitle
            )}
          </h2>
        </div>
        <LinkTabs
          tabs={[
            { label: "Month", href: href({ view: undefined }), active: view === "month" },
            { label: "Agenda", href: href({ view: "agenda" }), active: view === "agenda" },
          ]}
        />
      </div>

      <nav aria-label="Filter by type" className="scrollbar-none -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <FilterChip href={clearKindsHref} active={selected.length === 0} count={inPeriod.length}>
          All types
        </FilterChip>
        {available.map((kind) => {
          const Icon = KIND_ICONS[kind];
          return (
            <FilterChip key={kind} href={toggleKind(kind)} active={selected.includes(kind)} count={counts.get(kind) ?? 0}>
              <span aria-hidden className={cn("flex size-4 items-center justify-center rounded", TONE_CLASSES[CALENDAR_KINDS[kind].tone])}>
                <Icon className="size-3" />
              </span>
              {CALENDAR_KINDS[kind].label}
            </FilterChip>
          );
        })}
      </nav>

      {view === "month" ? (
        <>
          <Card className="hidden overflow-hidden md:block">
            <MonthGrid
              weeks={weeks}
              month={month}
              today={today}
              eventsByDay={gridEvents}
              agendaHref={(day) => `${href({ view: "agenda", month: monthKey(day) })}#d-${dayKey(day)}`}
            />
            {listEvents.length === 0 && (
              <div className="flex flex-wrap items-center justify-center gap-3 border-t border-border px-5 py-3 text-sm text-muted-foreground">
                <CalendarXIcon aria-hidden className="size-4" />
                {selected.length ? `None of the selected types fall ${periodPhrase}.` : `Nothing scheduled ${periodPhrase}.`}
                {selected.length > 0 && (
                  <Link href={clearKindsHref} className="font-medium text-primary-soft-foreground hover:underline">
                    Show all types
                  </Link>
                )}
              </div>
            )}
          </Card>
          <Card className="overflow-hidden md:hidden">{list}</Card>
        </>
      ) : (
        <Card className="overflow-hidden">{list}</Card>
      )}

      {available.includes("task") && (selected.length === 0 || selected.includes("task")) && (
        <p className="mt-3 text-xs text-muted-foreground">Task due dates show tasks assigned to you plus high-priority tasks you can see.</p>
      )}
    </>
  );
}

function FilterChip({ href, active, count, children }: { href: string; active: boolean; count: number; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary/50 bg-primary-soft text-primary-soft-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {active && <CheckIcon aria-hidden className="size-3.5" />}
      {children}
      <span className={cn("tabular rounded-full px-1.5 text-[11px] leading-5", active ? "bg-card/60" : "bg-muted")}>{count}</span>
      {active && <span className="sr-only">(selected)</span>}
    </Link>
  );
}
