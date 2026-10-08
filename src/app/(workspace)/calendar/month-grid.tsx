import { dayKey, monthKey } from "@/lib/dates";
import { formatDate, formatMonthShort, formatWeekday, formatWeekdayShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/server/services/calendar";
import { DayOverflow } from "./day-overflow";
import { EventChip } from "./event-chip";

/** Cells show at most this many entries; beyond that, one slot becomes "+N more". */
const MAX_VISIBLE = 3;

/** Monday-first month grid in SAST. `weeks` holds the start-of-day instant of every cell. */
export function MonthGrid({
  weeks,
  month,
  today,
  eventsByDay,
  agendaHref,
}: {
  weeks: Date[][];
  /** "YYYY-MM" of the month on display; other cells are padding days. */
  month: string;
  /** "YYYY-MM-DD" of today in SAST. */
  today: string;
  eventsByDay: Map<string, CalendarEvent[]>;
  /** Agenda link for a given day (used by the overflow popover). */
  agendaHref: (day: Date) => string;
}) {
  return (
    <table className="w-full table-fixed border-collapse">
      <thead>
        <tr>
          {weeks[0].map((day) => (
            <th key={dayKey(day)} scope="col" className="border-b border-border px-2 py-2 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {formatWeekdayShort(day)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, weekIndex) => (
          <tr key={dayKey(week[0])}>
            {week.map((day) => {
              const key = dayKey(day);
              const inMonth = monthKey(day) === month;
              const isToday = key === today;
              const events = eventsByDay.get(key) ?? [];
              const visible = events.length > MAX_VISIBLE ? events.slice(0, MAX_VISIBLE - 1) : events;
              const hidden = events.length - visible.length;
              const dayNumber = Number(key.slice(8));
              return (
                <td
                  key={key}
                  className={cn(
                    "h-32 border-b border-l border-border p-0 align-top first:border-l-0",
                    weekIndex === weeks.length - 1 && "border-b-0",
                    !inMonth && "bg-muted/40",
                    isToday && "bg-primary-soft/40",
                  )}
                >
                  <div className="flex h-full flex-col gap-1 p-1.5">
                    <p className="flex items-center gap-1.5">
                      <time
                        dateTime={key}
                        aria-hidden
                        className={cn(
                          "tabular flex size-6 items-center justify-center rounded-full text-xs font-medium",
                          isToday ? "bg-primary font-semibold text-primary-foreground" : !inMonth && "text-muted-foreground",
                        )}
                      >
                        {dayNumber}
                      </time>
                      {dayNumber === 1 && !inMonth && <span aria-hidden className="text-[11px] text-muted-foreground">{formatMonthShort(day)}</span>}
                      <span className="sr-only">
                        {formatDate(day)}
                        {isToday && ", today"}
                        {events.length > 0 ? `, ${events.length} item${events.length === 1 ? "" : "s"}` : ", nothing scheduled"}
                      </span>
                    </p>
                    {events.length > 0 && (
                      <ul className="min-w-0 space-y-0.5">
                        {visible.map((event) => (
                          <li key={event.id} className="min-w-0">
                            <EventChip event={event} />
                          </li>
                        ))}
                        {hidden > 0 && (
                          <li>
                            <DayOverflow hidden={hidden} dayLabel={formatWeekday(day)} agendaHref={agendaHref(day)}>
                              {events.map((event) => (
                                <EventChip key={event.id} event={event} />
                              ))}
                            </DayOverflow>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
