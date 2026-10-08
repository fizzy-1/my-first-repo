import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlusIcon, CheckSquareIcon, GavelIcon, MapPinIcon, NotebookPenIcon, VideoIcon } from "lucide-react";
import { MeetingType } from "@prisma/client";
import { createMeetingAction } from "@/server/actions/meetings";
import { can, requireUser } from "@/server/auth/current-user";
import { activeUserOptions } from "@/server/rbac";
import { listMeetings, type MeetingScope } from "@/server/services/meetings";
import { schoolOptions } from "@/server/services/schools";
import { Pagination } from "@/components/data-table/data-table";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { FormDialog } from "@/components/forms/form-dialog";
import { AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dayKey } from "@/lib/dates";
import { ATTENDEE_RESPONSE, MEETING_STATUS, MEETING_TYPE, optionsOf } from "@/lib/labels";
import { formatDate, formatTime, formatWeekdayShort } from "@/lib/format";
import { buildHref, oneOf, parseListParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { meetingFields, newMeetingDefaults } from "./fields";

export const metadata: Metadata = { title: "Meetings" };

const SCOPES = ["upcoming", "past", "mine"] as const satisfies readonly MeetingScope[];

export default async function MeetingsPage(props: PageProps<"/meetings">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const params = parseListParams(sp, { sortable: ["startsAt"] as const, defaultSort: "startsAt", pageSize: 20 });
  const scope = oneOf<MeetingScope>(params.filter("scope"), SCOPES) ?? "upcoming";
  const canSchedule = can(user, "meetings.write");
  const [list, people, schools] = await Promise.all([
    listMeetings(user, { scope, q: params.q || undefined, type: oneOf<MeetingType>(params.filter("type"), MeetingType), skip: params.skip, take: params.pageSize }),
    canSchedule ? activeUserOptions() : Promise.resolve([]),
    canSchedule && can(user, "schools.read") ? schoolOptions() : Promise.resolve([]),
  ]);

  // Group by SAST calendar day for an agenda-style list.
  const groups = new Map<string, typeof list.rows>();
  for (const m of list.rows) {
    const key = dayKey(m.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }

  return (
    <>
      <PageHeader
        title="Meetings"
        description={can(user, "meetings.read.all") ? "Every company meeting, with agendas, notes, decisions and action items." : "Meetings you organise or attend, with agendas, notes, decisions and action items."}
        actions={
          canSchedule && (
            <FormDialog
              title="Schedule a meeting"
              description="Attendees are notified and the meeting appears on their calendar."
              size="lg"
              trigger={
                <Button>
                  <CalendarPlusIcon /> Schedule meeting
                </Button>
              }
              openParam="meeting"
              action={createMeetingAction}
              fields={meetingFields({ people: people.filter((p) => p.value !== user.id).map(({ value, label }) => ({ value, label })), schools, canBoard: can(user, "meetings.read.all") })}
              defaultValues={newMeetingDefaults()}
              submitLabel="Schedule"
              successHref="/meetings/{id}"
            />
          )
        }
      />
      <LinkTabs
        className="mb-4"
        tabs={[
          { label: "Upcoming", href: buildHref("/meetings", {}, {}), active: scope === "upcoming" },
          { label: "Past", href: buildHref("/meetings", {}, { scope: "past" }), active: scope === "past" },
          { label: "My meetings", href: buildHref("/meetings", {}, { scope: "mine" }), active: scope === "mine" },
        ]}
      />
      <Card className="overflow-hidden">
        <TableToolbar searchPlaceholder="Search titles, agendas and notes…" filters={[{ param: "type", label: "Type", options: optionsOf(MEETING_TYPE) }]} />
        {list.rows.length === 0 ? (
          <EmptyState
            icon={NotebookPenIcon}
            title={scope === "upcoming" ? "No upcoming meetings" : "No meetings found"}
            description={canSchedule ? "Schedule one with “Schedule meeting”." : "Meetings you're invited to will appear here."}
          />
        ) : (
          <div className="divide-y divide-border">
            {[...groups.entries()].map(([key, meetings]) => (
              <section key={key} aria-label={formatDate(meetings[0].startsAt)}>
                <h2 className="bg-muted/40 px-5 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {formatWeekdayShort(meetings[0].startsAt)} {formatDate(meetings[0].startsAt)}
                </h2>
                <ul className="divide-y divide-border">
                  {meetings.map((m) => (
                    <li key={m.id}>
                      <Link href={`/meetings/${m.id}`} className={cn("flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-accent/50 sm:flex-row sm:items-center", m.status === "CANCELLED" && "opacity-60")}>
                        <div className="tabular w-28 shrink-0 text-sm">
                          <span className="font-medium">{formatTime(m.startsAt)}</span>
                          <span className="text-muted-foreground"> – {formatTime(m.endsAt)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={cn("font-medium", m.status === "CANCELLED" && "line-through")}>{m.title}</p>
                            <StatusBadge meta={MEETING_TYPE} value={m.type} />
                            {m.status !== "SCHEDULED" && <StatusBadge meta={MEETING_STATUS} value={m.status} />}
                            {m.myResponse && m.myResponse !== "ACCEPTED" && m.status === "SCHEDULED" && scope !== "past" && (
                              <StatusBadge meta={ATTENDEE_RESPONSE} value={m.myResponse} />
                            )}
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>Organised by {m.organizer.name}</span>
                            {m.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPinIcon className="size-3" /> {m.location}
                              </span>
                            )}
                            {m.videoLink && (
                              <span className="inline-flex items-center gap-1">
                                <VideoIcon className="size-3" /> Video call
                              </span>
                            )}
                            {m.school && <span>{m.school.name}</span>}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
                          {m._count.decisions > 0 && (
                            <span className="inline-flex items-center gap-1" title="Decisions recorded">
                              <GavelIcon className="size-3.5" /> {m._count.decisions}
                            </span>
                          )}
                          {m.actionItemCount > 0 && (
                            <span className={cn("inline-flex items-center gap-1", m.openActionItems > 0 && "text-foreground")} title={`${m.openActionItems} open of ${m.actionItemCount} action items`}>
                              <CheckSquareIcon className="size-3.5" /> {m.actionItemCount - m.openActionItems}/{m.actionItemCount}
                            </span>
                          )}
                          <AvatarStack names={m.attendees.map((a) => a.name)} max={4} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        <Pagination total={list.total} params={params} pathname="/meetings" searchParams={sp} />
      </Card>
    </>
  );
}
