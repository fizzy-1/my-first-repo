import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { CALENDAR_KINDS, type CalendarEvent } from "@/server/services/calendar";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KIND_ICONS, TONE_CLASSES } from "./kinds";

/** Compact month-grid entry: kind icon + (time) + title, tinted by kind. */
export function EventChip({ event }: { event: CalendarEvent }) {
  const kind = CALENDAR_KINDS[event.kind];
  const Icon = KIND_ICONS[event.kind];
  const time = event.allDay ? null : formatTime(event.at);
  const label = `${kind.label}: ${event.title}${time ? ` at ${time}` : ""}${event.urgent ? " (urgent)" : ""}`;
  return (
    <Link
      href={event.href}
      title={event.subtitle ? `${label} · ${event.subtitle}` : label}
      aria-label={label}
      className={cn(
        "flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-medium outline-none",
        "transition-shadow hover:ring-1 hover:ring-current/40 focus-visible:ring-2 focus-visible:ring-ring",
        TONE_CLASSES[kind.tone],
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      {time && <span className="tabular shrink-0 opacity-80">{time}</span>}
      <span className="truncate">{event.title}</span>
      {event.urgent && <TriangleAlertIcon aria-hidden className="ml-auto size-3 shrink-0 text-danger" />}
    </Link>
  );
}
