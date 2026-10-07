import Link from "next/link";
import { CalendarIcon, ListTodoIcon, MegaphoneIcon } from "lucide-react";
import { DueDate } from "@/components/common/due-date";
import { EmptyState } from "@/components/common/empty-state";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ANNOUNCEMENT_LEVEL, MEETING_TYPE, PRIORITY } from "@/lib/labels";
import { formatRelative, formatTime, formatWeekday } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardData } from "./types";

export function MyWork({ tasks, meetings }: { tasks: DashboardData["myTasks"]; meetings: DashboardData["myMeetings"] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard
        title="My tasks"
        description="Open tasks assigned to you"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/tasks">All tasks</Link>
          </Button>
        }
      >
        {tasks.length === 0 ? (
          <EmptyState compact icon={ListTodoIcon} title="No open tasks" description="You're all clear." />
        ) : (
          <ul className="divide-y divide-border">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                  {t.title}
                </Link>
                <StatusBadge meta={PRIORITY} value={t.priority} dot={false} />
                <span className="text-xs">
                  <DueDate date={t.dueDate} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard
        title="My upcoming meetings"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/meetings">All meetings</Link>
          </Button>
        }
      >
        {meetings.length === 0 ? (
          <EmptyState compact icon={CalendarIcon} title="No upcoming meetings" />
        ) : (
          <ul className="divide-y divide-border">
            {meetings.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <div className="w-20 shrink-0 text-xs">
                  <p className="font-medium">{formatWeekday(m.startsAt)}</p>
                  <p className="tabular text-muted-foreground">{formatTime(m.startsAt)}</p>
                </div>
                <Link href={`/meetings/${m.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                  {m.title}
                </Link>
                <StatusBadge meta={MEETING_TYPE} value={m.type} dot={false} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

export function Announcements({ items }: { items: DashboardData["announcements"] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div
          key={a.id}
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3",
            a.level === "CRITICAL" ? "border-danger/40 bg-danger-soft" : a.level === "IMPORTANT" ? "border-warning/40 bg-warning-soft" : "border-border bg-card",
          )}
        >
          <MegaphoneIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {a.title} <Badge tone={ANNOUNCEMENT_LEVEL[a.level].tone} className="ml-1 align-middle">{ANNOUNCEMENT_LEVEL[a.level].label}</Badge>
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{a.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {a.author.name} · {formatRelative(a.publishedAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
