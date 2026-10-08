import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClockIcon, CheckIcon, CircleHelpIcon, ListPlusIcon, MapPinIcon, PencilIcon, Trash2Icon, VideoIcon, XIcon } from "lucide-react";
import type { MeetingStatus } from "@prisma/client";
import {
  addActionItemAction,
  addDecisionAction,
  deleteDecisionAction,
  deleteMeetingAction,
  respondToMeetingAction,
  saveMeetingNotesAction,
  setMeetingStatusAction,
  updateMeetingAction,
} from "@/server/actions/meetings";
import { can, requireUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors";
import { activeUserOptions } from "@/server/rbac";
import { getMeeting } from "@/server/services/meetings";
import { schoolOptions } from "@/server/services/schools";
import { DueDate } from "@/components/common/due-date";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { StatusMenu } from "@/components/common/status-menu";
import { UserChip } from "@/components/common/user-chip";
import { ActionButton, ConfirmActionButton } from "@/components/forms/action-button";
import { EntityForm } from "@/components/forms/entity-form";
import { FormDialog } from "@/components/forms/form-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ATTENDEE_RESPONSE, MEETING_STATUS, MEETING_TYPE, PRIORITY, TASK_STATUS } from "@/lib/labels";
import { formatDate, formatDateTime, formatRelative, formatTime, formatWeekdayShort } from "@/lib/format";
import { actionItemFields, meetingDefaults, meetingFields } from "../fields";
import { AttendanceForm } from "./attendance-form";

export const metadata: Metadata = { title: "Meeting" };

export default async function MeetingPage(props: PageProps<"/meetings/[id]">) {
  const { id } = await props.params;
  const user = await requireUser();
  let m: Awaited<ReturnType<typeof getMeeting>>;
  try {
    m = await getMeeting(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const [people, schools] = m.canEdit
    ? await Promise.all([activeUserOptions(), can(user, "schools.read") ? schoolOptions() : Promise.resolve([])])
    : [[], []];
  const now = new Date();
  const started = m.startsAt <= now;
  const isAttendee = m.myResponse !== null;
  const canRsvp = isAttendee && m.organizerId !== user.id && m.status === "SCHEDULED" && m.endsAt > now;
  const responses = { ACCEPTED: 0, TENTATIVE: 0, DECLINED: 0, PENDING: 0 };
  for (const a of m.attendees) responses[a.response]++;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Meetings", href: "/meetings" }, { label: m.title }]}
        title={m.title}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClockIcon className="size-4" />
              {formatWeekdayShort(m.startsAt)} {formatDate(m.startsAt)}, {formatTime(m.startsAt)} – {formatTime(m.endsAt)}
            </span>
            {m.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPinIcon className="size-4" /> {m.location}
              </span>
            )}
            {m.videoLink && (
              <a href={m.videoLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
                <VideoIcon className="size-4" /> Join video call
              </a>
            )}
          </span>
        }
        meta={
          <>
            <StatusBadge meta={MEETING_TYPE} value={m.type} />
            {m.canEdit ? (
              <StatusMenu id={m.id} value={m.status} meta={MEETING_STATUS} options={Object.keys(MEETING_STATUS) as MeetingStatus[]} action={setMeetingStatusAction} />
            ) : (
              <StatusBadge meta={MEETING_STATUS} value={m.status} />
            )}
            {m.school && (
              <Link href={`/schools/${m.school.id}`} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                {m.school.name}
              </Link>
            )}
          </>
        }
        actions={
          <>
            {canRsvp && (
              <div className="flex items-center gap-1 rounded-lg border border-border p-1" role="group" aria-label="Your reply">
                <ActionButton action={respondToMeetingAction} input={{ id: m.id, response: "ACCEPTED" as const }} size="sm" variant={m.myResponse === "ACCEPTED" ? "default" : "ghost"}>
                  <CheckIcon /> Going
                </ActionButton>
                <ActionButton action={respondToMeetingAction} input={{ id: m.id, response: "TENTATIVE" as const }} size="sm" variant={m.myResponse === "TENTATIVE" ? "default" : "ghost"}>
                  <CircleHelpIcon /> Maybe
                </ActionButton>
                <ActionButton action={respondToMeetingAction} input={{ id: m.id, response: "DECLINED" as const }} size="sm" variant={m.myResponse === "DECLINED" ? "destructive" : "ghost"}>
                  <XIcon /> Decline
                </ActionButton>
              </div>
            )}
            {m.canEdit && (
              <FormDialog
                title="Edit meeting"
                description="Changing the time asks attendees to confirm again."
                size="lg"
                trigger={
                  <Button variant="outline">
                    <PencilIcon /> Edit
                  </Button>
                }
                action={updateMeetingAction}
                fields={[
                  { type: "hidden", name: "id", value: m.id },
                  ...meetingFields({ people: people.filter((p) => p.value !== m.organizerId).map(({ value, label }) => ({ value, label })), schools, canBoard: can(user, "meetings.read.all") || m.type === "BOARD" }),
                ]}
                defaultValues={meetingDefaults(m)}
              />
            )}
            {m.canEdit && (
              <ConfirmActionButton
                action={deleteMeetingAction}
                input={{ id: m.id }}
                variant="ghost"
                size="icon"
                aria-label="Delete meeting"
                title="Delete this meeting?"
                description="Notes and decisions are removed. Action items stay in people's task lists. Prefer “Cancelled” for meetings that didn't happen."
                confirmLabel="Delete"
              >
                <Trash2Icon />
              </ConfirmActionButton>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Agenda & notes" description={m.canRecord ? "Attendees can edit these during or after the meeting." : undefined}>
            {m.canRecord ? (
              <EntityForm
                action={saveMeetingNotesAction}
                submitLabel="Save notes"
                fields={[
                  { type: "hidden", name: "id", value: m.id },
                  { type: "textarea", name: "agenda", label: "Agenda", rows: 5 },
                  { type: "textarea", name: "notes", label: "Meeting notes", rows: 8, placeholder: started ? "Key discussion points…" : "Notes can be added once the meeting starts, or prepared in advance." },
                ]}
                defaultValues={{ agenda: m.agenda ?? "", notes: m.notes ?? "" }}
              />
            ) : (
              <div className="space-y-5 text-sm">
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Agenda</h3>
                  <p className="whitespace-pre-wrap">{m.agenda || "No agenda yet."}</p>
                </div>
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Notes</h3>
                  <p className="whitespace-pre-wrap">{m.notes || "No notes recorded."}</p>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Decisions" description="The record of what was agreed.">
            {m.decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>
            ) : (
              <ol className="space-y-3">
                {m.decisions.map((d, i) => (
                  <li key={d.id} className="flex gap-3">
                    <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{d.description}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Recorded by {d.recordedBy.name} · {formatRelative(d.createdAt, now)}
                      </p>
                    </div>
                    {(d.recordedBy.id === user.id || m.canEdit) && (
                      <ConfirmActionButton
                        action={deleteDecisionAction}
                        input={{ id: d.id }}
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove decision"
                        title="Remove this decision?"
                        description="It will be removed from the meeting record. The removal is kept in the audit log."
                        confirmLabel="Remove"
                      >
                        <Trash2Icon />
                      </ConfirmActionButton>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {m.canRecord && (
              <div className="mt-4 border-t border-border pt-4">
                <EntityForm
                  action={addDecisionAction}
                  resetOnSuccess
                  submitLabel="Record decision"
                  fields={[
                    { type: "hidden", name: "meetingId", value: m.id },
                    { type: "textarea", name: "description", label: "New decision", rows: 2, placeholder: "e.g. Approve R25,000 for the November matric campaign" },
                  ]}
                />
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Action items"
            description="Each action item is a task in the owner's task list."
            flush
            actions={
              m.canRecord && (
                <FormDialog
                  title="Add action item"
                  description="Creates a task for the owner and notifies them."
                  trigger={
                    <Button size="sm" variant="outline">
                      <ListPlusIcon /> Add action item
                    </Button>
                  }
                  openParam="action"
                  action={addActionItemAction}
                  fields={[{ type: "hidden", name: "meetingId", value: m.id }, ...actionItemFields(m.participants)]}
                  defaultValues={{ priority: "MEDIUM" }}
                  submitLabel="Add"
                />
              )
            }
          >
            {m.actionItems.length === 0 ? (
              <EmptyState title="No action items" description="Add follow-ups so they land in people's task lists." className="py-8" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Task</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="hidden md:table-cell">Priority</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.actionItems.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                          <span className="tabular mr-1.5 text-muted-foreground">#{t.number}</span>
                          {t.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <UserChip name={t.assignee?.name} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <StatusBadge meta={PRIORITY} value={t.priority} />
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <DueDate date={t.dueDate} done={t.status === "COMPLETED"} now={now} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge meta={TASK_STATUS} value={t.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Details">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Organiser</dt>
                <dd>
                  <UserChip name={m.organizer.name} subtitle={m.organizer.jobTitle} />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">When</dt>
                <dd className="text-right">{formatDateTime(m.startsAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Duration</dt>
                <dd>{Math.round((m.endsAt.getTime() - m.startsAt.getTime()) / 60_000)} min</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Replies</dt>
                <dd className="text-right text-xs">
                  {responses.ACCEPTED} going · {responses.TENTATIVE} maybe · {responses.DECLINED} declined · {responses.PENDING} awaiting
                </dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title={`Attendees (${m.attendees.length})`}>
            <ul className="space-y-2.5">
              {m.attendees.map((a) => (
                <li key={a.userId} className="flex items-center gap-3">
                  <Avatar name={a.user.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {a.user.name}
                      {a.userId === m.organizerId && <span className="ml-1.5 text-xs font-normal text-muted-foreground">organiser</span>}
                    </p>
                    {a.user.jobTitle && <p className="truncate text-xs text-muted-foreground">{a.user.jobTitle}</p>}
                  </div>
                  {started && a.attended !== null ? (
                    <span className={a.attended ? "text-xs text-success" : "text-xs text-muted-foreground"}>{a.attended ? "Attended" : "Absent"}</span>
                  ) : (
                    <StatusBadge meta={ATTENDEE_RESPONSE} value={a.response} />
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>

          {m.canRecord && started && m.status !== "CANCELLED" && (
            <SectionCard title="Attendance" description="Tick everyone who joined.">
              <AttendanceForm meetingId={m.id} attendees={m.attendees.map((a) => ({ id: a.userId, name: a.user.name, attended: a.attended }))} />
            </SectionCard>
          )}
        </div>
      </div>
    </>
  );
}
