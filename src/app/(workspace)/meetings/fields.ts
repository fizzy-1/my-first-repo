import type { FieldDef, FieldOption, FormValues } from "@/components/forms/types";
import { toDateTimeInput } from "@/lib/dates";
import { MEETING_TYPE, PRIORITY, optionsOf } from "@/lib/labels";
import type { MeetingType } from "@prisma/client";

export function meetingFields(opts: { people: FieldOption[]; schools: FieldOption[]; canBoard: boolean }): FieldDef[] {
  const types = (Object.keys(MEETING_TYPE) as MeetingType[]).filter((t) => t !== "BOARD" || opts.canBoard);
  return [
    { type: "text", name: "title", label: "Title", required: true, span: 2, placeholder: "e.g. Weekly marketing stand-up" },
    { type: "select", name: "type", label: "Meeting type", required: true, options: optionsOf(MEETING_TYPE, types) },
    ...(opts.schools.length ? ([{ type: "select", name: "schoolId", label: "School (for school meetings)", options: opts.schools, emptyLabel: "None" }] as FieldDef[]) : []),
    { type: "datetime", name: "startsAt", label: "Starts", required: true },
    { type: "datetime", name: "endsAt", label: "Ends", required: true },
    { type: "text", name: "location", label: "Location", placeholder: "Boardroom, school address…" },
    { type: "url", name: "videoLink", label: "Video link", placeholder: "https://meet.google.com/…" },
    { type: "multiselect", name: "attendeeIds", label: "Attendees", options: opts.people, span: 2, hint: "Attendees receive an invitation notification. You're added automatically." },
    { type: "textarea", name: "agenda", label: "Agenda", rows: 5, placeholder: "1. Review last week's action items\n2. …" },
  ];
}

/** Next full hour, one hour long. */
export function newMeetingDefaults(now = new Date()): FormValues {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60_000);
  return { type: "OTHER", startsAt: toDateTimeInput(start), endsAt: toDateTimeInput(end) };
}

export function meetingDefaults(m: {
  title: string;
  type: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  videoLink: string | null;
  agenda: string | null;
  schoolId: string | null;
  organizerId: string;
  attendees: { userId: string }[];
}): FormValues {
  return {
    title: m.title,
    type: m.type,
    startsAt: toDateTimeInput(m.startsAt),
    endsAt: toDateTimeInput(m.endsAt),
    location: m.location ?? "",
    videoLink: m.videoLink ?? "",
    agenda: m.agenda ?? "",
    schoolId: m.schoolId ?? "",
    attendeeIds: m.attendees.map((a) => a.userId).filter((id) => id !== m.organizerId),
  };
}

export function actionItemFields(participants: FieldOption[]): FieldDef[] {
  return [
    { type: "text", name: "title", label: "Action item", required: true, span: 2, placeholder: "What needs to happen?" },
    { type: "select", name: "assigneeId", label: "Owner", required: true, options: participants },
    { type: "date", name: "dueDate", label: "Due date" },
    { type: "select", name: "priority", label: "Priority", required: true, options: optionsOf(PRIORITY) },
  ];
}
