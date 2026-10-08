import Link from "next/link";
import { ChevronDownIcon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatShortDate, formatTime, formatWeekday } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CALENDAR_KINDS, type CalendarEvent } from "@/server/services/calendar";
import { KIND_ICONS, TONE_CLASSES } from "./kinds";

export interface AgendaGroup {
  /** "YYYY-MM-DD" (SAST), or "overdue" for the catch-up group. */
  key: string;
  /** Start of the SAST day; null for the overdue group. */
  day: Date | null;
  events: CalendarEvent[];
}

/** Overdue backlogs longer than this start collapsed so upcoming days stay in view. */
const OVERDUE_OPEN_LIMIT = 5;

/** Day-grouped list of calendar items (agenda view, and the month view on small screens). */
export function AgendaList({ groups, today, tomorrow }: { groups: AgendaGroup[]; today: string; tomorrow: string }) {
  return (
    <div className="divide-y divide-border">
      {groups.map((group) => {
        const count = (
          <span className="tabular ml-auto font-medium normal-case" aria-label={`${group.events.length} item${group.events.length === 1 ? "" : "s"}`}>
            {group.events.length}
          </span>
        );
        const items = (
          <ul className="divide-y divide-border">
            {group.events.map((event) => (
              <AgendaItem key={event.id} event={event} overdue={group.day === null} />
            ))}
          </ul>
        );
        if (group.day === null) {
          return (
            <section key={group.key} id="overdue" aria-label="Overdue" className="scroll-mt-24">
              <details open={group.events.length <= OVERDUE_OPEN_LIMIT} className="group/overdue">
                <summary className="flex cursor-pointer list-none items-center gap-2 bg-danger-soft/40 px-4 py-2 text-xs font-semibold tracking-wide text-danger uppercase outline-none hover:bg-danger-soft/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5 [&::-webkit-details-marker]:hidden">
                  <TriangleAlertIcon aria-hidden className="size-3.5" /> Overdue
                  {count}
                  <span className="font-medium normal-case group-open/overdue:hidden">Show</span>
                  <span className="hidden font-medium normal-case group-open/overdue:inline">Hide</span>
                  <ChevronDownIcon aria-hidden className="size-4 transition-transform group-open/overdue:rotate-180" />
                </summary>
                {items}
              </details>
            </section>
          );
        }
        const headingId = `agenda-${group.key}`;
        return (
          <section key={group.key} id={`d-${group.key}`} aria-labelledby={headingId} className="scroll-mt-24">
            <h3 id={headingId} className="flex items-center gap-2 bg-muted/40 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:px-5">
              {formatWeekday(group.day)}
              {group.key === today && <Badge tone="primary">Today</Badge>}
              {group.key === tomorrow && <Badge tone="neutral">Tomorrow</Badge>}
              {count}
            </h3>
            {items}
          </section>
        );
      })}
    </div>
  );
}

/** In the overdue group the date replaces the time, and every row is already past due. */
function AgendaItem({ event, overdue }: { event: CalendarEvent; overdue: boolean }) {
  const kind = CALENDAR_KINDS[event.kind];
  const Icon = KIND_ICONS[event.kind];
  return (
    <li>
      <Link href={event.href} className="flex items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-accent/50 focus-visible:bg-accent/50 sm:px-5">
        <div className="tabular w-14 shrink-0 text-sm">
          {overdue ? (
            <span className="font-medium">{formatShortDate(event.at)}</span>
          ) : event.allDay ? (
            <span className="text-xs text-muted-foreground">All day</span>
          ) : (
            <span className="font-medium">{formatTime(event.at)}</span>
          )}
        </div>
        <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TONE_CLASSES[kind.tone])}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium sm:line-clamp-1">{event.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {kind.label}
            {event.subtitle && ` · ${event.subtitle}`}
          </p>
        </div>
        {event.urgent && !overdue && (
          <Badge tone="danger" className="shrink-0">
            <TriangleAlertIcon aria-hidden /> Urgent
          </Badge>
        )}
      </Link>
    </li>
  );
}
