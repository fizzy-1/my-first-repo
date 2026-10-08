import "server-only";
import type { AttendeeResponse, MeetingStatus, MeetingType, Prisma, Priority } from "@prisma/client";
import { ATTENDEE_RESPONSE, MEETING_STATUS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { audit, diffFields } from "@/server/audit";
import { assertCan, can, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { notify } from "@/server/notify";
import { meetingsVisibleWhere } from "./access";
import { createTask } from "./tasks";

export { meetingsVisibleWhere };

// ─────────────────────────── Access rules ───────────────────────────

type MeetingAccessShape = { organizerId: string; attendees: { userId: string }[] };

/** Edit details, attendees and status: the organiser, or a director who can see every meeting. */
function canEditMeeting(user: SessionUser, m: { organizerId: string }) {
  return m.organizerId === user.id || (can(user, "meetings.read.all") && can(user, "meetings.write"));
}

/** Record notes, decisions, attendance and action items: editors plus any attendee. */
function canRecordMeeting(user: SessionUser, m: MeetingAccessShape) {
  return canEditMeeting(user, m) || m.attendees.some((a) => a.userId === user.id);
}

/** Board meetings are visible to attendees only (plus directors), so only directors may schedule them. */
function assertCanUseType(user: SessionUser, type: MeetingType) {
  if (type === "BOARD" && !can(user, "meetings.read.all")) throw new ForbiddenError("Only directors can schedule board meetings.");
}

async function loadForAccess(user: SessionUser, id: string) {
  const meeting = await db.meeting.findFirst({
    where: { AND: [{ id }, meetingsVisibleWhere(user)] },
    include: { attendees: { select: { userId: true } } },
  });
  if (!meeting) throw new NotFoundError("Meeting");
  return meeting;
}

// ─────────────────────────── Queries ───────────────────────────

export type MeetingScope = "upcoming" | "past" | "mine";

export async function listMeetings(
  user: SessionUser,
  opts: { scope: MeetingScope; q?: string; type?: MeetingType; status?: MeetingStatus; skip: number; take: number },
) {
  const now = new Date();
  const scopeWhere: Prisma.MeetingWhereInput =
    opts.scope === "upcoming"
      ? { endsAt: { gte: now }, status: { not: "CANCELLED" } }
      : opts.scope === "past"
        ? { OR: [{ endsAt: { lt: now } }, { status: "CANCELLED" }] }
        : { OR: [{ organizerId: user.id }, { attendees: { some: { userId: user.id } } }] };
  const where: Prisma.MeetingWhereInput = {
    AND: [
      meetingsVisibleWhere(user),
      scopeWhere,
      opts.type ? { type: opts.type } : {},
      opts.status ? { status: opts.status } : {},
      opts.q
        ? {
            OR: [
              { title: { contains: opts.q, mode: "insensitive" } },
              { agenda: { contains: opts.q, mode: "insensitive" } },
              { notes: { contains: opts.q, mode: "insensitive" } },
              { location: { contains: opts.q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };
  const [rows, total] = await Promise.all([
    db.meeting.findMany({
      where,
      orderBy: { startsAt: opts.scope === "upcoming" ? "asc" : "desc" },
      skip: opts.skip,
      take: opts.take,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        location: true,
        videoLink: true,
        organizer: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
        attendees: { select: { response: true, user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } },
        _count: { select: { decisions: true } },
        actionItems: { select: { status: true } },
      },
    }),
    db.meeting.count({ where }),
  ]);
  return {
    total,
    rows: rows.map(({ actionItems, attendees, ...m }) => ({
      ...m,
      attendees: attendees.map((a) => ({ ...a.user, response: a.response })),
      myResponse: attendees.find((a) => a.user.id === user.id)?.response ?? null,
      actionItemCount: actionItems.length,
      openActionItems: actionItems.filter((t) => t.status !== "COMPLETED").length,
    })),
  };
}

export async function getMeeting(user: SessionUser, id: string) {
  const meeting = await db.meeting.findFirst({
    where: { AND: [{ id }, meetingsVisibleWhere(user)] },
    include: {
      organizer: { select: { id: true, name: true, jobTitle: true } },
      school: { select: { id: true, name: true } },
      attendees: { include: { user: { select: { id: true, name: true, jobTitle: true } } }, orderBy: { user: { name: "asc" } } },
      decisions: { orderBy: { createdAt: "asc" }, include: { recordedBy: { select: { id: true, name: true } } } },
      actionItems: {
        orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }],
        select: { id: true, number: true, title: true, status: true, priority: true, dueDate: true, assignee: { select: { id: true, name: true } } },
      },
    },
  });
  if (!meeting) throw new NotFoundError("Meeting");
  const access = { organizerId: meeting.organizerId, attendees: meeting.attendees.map((a) => ({ userId: a.userId })) };
  return {
    ...meeting,
    canEdit: canEditMeeting(user, meeting),
    canRecord: canRecordMeeting(user, access),
    myResponse: meeting.attendees.find((a) => a.userId === user.id)?.response ?? null,
    /** People an action item can be assigned to: the organiser and attendees. */
    participants: [
      { value: meeting.organizer.id, label: meeting.organizer.name },
      ...meeting.attendees.filter((a) => a.userId !== meeting.organizerId).map((a) => ({ value: a.user.id, label: a.user.name })),
    ],
  };
}

/** Upcoming meetings for the current user (organised or attending), used by the dashboard and mobile views. */
export async function myUpcomingMeetings(user: SessionUser, take = 5) {
  return db.meeting.findMany({
    where: {
      endsAt: { gte: new Date() },
      status: "SCHEDULED",
      OR: [{ organizerId: user.id }, { attendees: { some: { userId: user.id, response: { not: "DECLINED" } } } }],
    },
    orderBy: { startsAt: "asc" },
    take,
    select: { id: true, title: true, type: true, startsAt: true, endsAt: true, location: true, videoLink: true },
  });
}

// ─────────────────────────── Mutations ───────────────────────────

export interface MeetingInput {
  title: string;
  type: MeetingType;
  startsAt: Date;
  endsAt: Date;
  location?: string;
  videoLink?: string;
  agenda?: string;
  schoolId?: string;
  attendeeIds: string[];
}

async function validateMeeting(user: SessionUser, input: MeetingInput) {
  if (input.endsAt <= input.startsAt) throw new ValidationError("The meeting must end after it starts.", { endsAt: ["End time must be after the start time."] });
  if (input.endsAt.getTime() - input.startsAt.getTime() > 12 * 3600_000) throw new ValidationError("Meetings can be at most 12 hours long.", { endsAt: ["Keep meetings under 12 hours."] });
  assertCanUseType(user, input.type);
  if (input.schoolId && !can(user, "schools.read")) throw new ValidationError("You don't have access to school records.", { schoolId: ["Leave this empty."] });
  const ids = [...new Set(input.attendeeIds)];
  if (ids.length) {
    const active = await db.user.count({ where: { id: { in: ids }, status: "ACTIVE" } });
    if (active !== ids.length) throw new ValidationError("Some attendees are not active users.", { attendeeIds: ["Choose active team members."] });
  }
  return ids;
}

function whenText(startsAt: Date) {
  return formatDateTime(startsAt);
}

export async function createMeeting(user: SessionUser, input: MeetingInput) {
  assertCan(user, "meetings.write");
  const attendeeIds = (await validateMeeting(user, input)).filter((id) => id !== user.id);
  return db.$transaction(async (tx) => {
    const meeting = await tx.meeting.create({
      data: {
        title: input.title,
        type: input.type,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        location: input.location ?? null,
        videoLink: input.videoLink ?? null,
        agenda: input.agenda ?? null,
        schoolId: input.schoolId ?? null,
        organizerId: user.id,
        // The organiser is recorded as an accepted attendee so attendance can be tracked for everyone.
        attendees: { create: [{ userId: user.id, response: "ACCEPTED" as const }, ...attendeeIds.map((userId) => ({ userId }))] },
      },
    });
    await audit(
      user,
      {
        action: "meeting.scheduled",
        module: "meetings",
        entityType: "Meeting",
        entityId: meeting.id,
        summary: `${user.name} scheduled “${meeting.title}” for ${whenText(meeting.startsAt)}`,
        after: { title: meeting.title, type: meeting.type, startsAt: meeting.startsAt, attendees: attendeeIds.length + 1 },
        feed: meeting.type !== "BOARD",
      },
      tx,
    );
    await notify(
      {
        userIds: attendeeIds,
        type: "MEETING_INVITATION",
        title: `Meeting invitation: ${meeting.title}`,
        body: `${user.name} invited you to a meeting on ${whenText(meeting.startsAt)}${meeting.location ? ` · ${meeting.location}` : ""}.`,
        link: `/meetings/${meeting.id}`,
        dedupeKey: `meeting-invite:${meeting.id}`,
      },
      tx,
    );
    return meeting;
  });
}

export async function updateMeeting(user: SessionUser, id: string, input: MeetingInput) {
  const existing = await loadForAccess(user, id);
  if (!canEditMeeting(user, existing)) throw new ForbiddenError("Only the organiser can edit this meeting.");
  const wanted = new Set((await validateMeeting(user, input)).concat(existing.organizerId));
  const current = new Set(existing.attendees.map((a) => a.userId));
  const added = [...wanted].filter((u) => !current.has(u));
  const removed = [...current].filter((u) => !wanted.has(u));

  const data = {
    title: input.title,
    type: input.type,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    location: input.location ?? null,
    videoLink: input.videoLink ?? null,
    agenda: input.agenda ?? null,
    schoolId: input.schoolId ?? null,
  };
  const changes = diffFields(existing, data);
  if (!changes && !added.length && !removed.length) return;
  const rescheduled = existing.startsAt.getTime() !== input.startsAt.getTime() || existing.endsAt.getTime() !== input.endsAt.getTime();

  await db.$transaction(async (tx) => {
    await tx.meeting.update({ where: { id }, data });
    if (removed.length) await tx.meetingAttendee.deleteMany({ where: { meetingId: id, userId: { in: removed } } });
    if (added.length) await tx.meetingAttendee.createMany({ data: added.map((userId) => ({ meetingId: id, userId })), skipDuplicates: true });
    await audit(
      user,
      {
        action: "meeting.updated",
        module: "meetings",
        entityType: "Meeting",
        entityId: id,
        summary: `${user.name} updated “${input.title}”${rescheduled ? ` (moved to ${whenText(input.startsAt)})` : ""}`,
        before: { ...(changes?.before ?? {}), ...(removed.length ? { removedAttendees: removed } : {}) },
        after: { ...(changes?.after ?? {}), ...(added.length ? { addedAttendees: added } : {}) },
      },
      tx,
    );
    await notify(
      {
        userIds: added,
        type: "MEETING_INVITATION",
        title: `Meeting invitation: ${input.title}`,
        body: `${user.name} invited you to a meeting on ${whenText(input.startsAt)}.`,
        link: `/meetings/${id}`,
        dedupeKey: `meeting-invite:${id}`,
        excludeUserId: user.id,
      },
      tx,
    );
    if (rescheduled) {
      // Reset replies: people need to confirm the new time.
      await tx.meetingAttendee.updateMany({ where: { meetingId: id, userId: { notIn: [...added, existing.organizerId] } }, data: { response: "PENDING" } });
      await notify(
        {
          userIds: [...wanted].filter((u) => !added.includes(u)),
          type: "MEETING_INVITATION",
          title: `Rescheduled: ${input.title}`,
          body: `${user.name} moved this meeting to ${whenText(input.startsAt)}. Please confirm whether you can attend.`,
          link: `/meetings/${id}`,
          excludeUserId: user.id,
        },
        tx,
      );
    }
  });
}

export async function setMeetingStatus(user: SessionUser, id: string, status: MeetingStatus) {
  const existing = await loadForAccess(user, id);
  if (!canEditMeeting(user, existing)) throw new ForbiddenError("Only the organiser can change this meeting's status.");
  if (existing.status === status) return;
  await db.$transaction(async (tx) => {
    await tx.meeting.update({ where: { id }, data: { status } });
    await audit(
      user,
      {
        action: "meeting.status_changed",
        module: "meetings",
        entityType: "Meeting",
        entityId: id,
        summary: `${user.name} marked “${existing.title}” as ${MEETING_STATUS[status].label.toLowerCase()}`,
        before: { status: existing.status },
        after: { status },
        feed: existing.type !== "BOARD" && status === "CANCELLED",
      },
      tx,
    );
    if (status === "CANCELLED") {
      await notify(
        {
          userIds: existing.attendees.map((a) => a.userId),
          type: "MEETING_INVITATION",
          title: `Cancelled: ${existing.title}`,
          body: `${user.name} cancelled the meeting planned for ${whenText(existing.startsAt)}.`,
          link: `/meetings/${id}`,
          excludeUserId: user.id,
        },
        tx,
      );
    }
  });
}

export async function deleteMeeting(user: SessionUser, id: string) {
  const existing = await loadForAccess(user, id);
  if (!canEditMeeting(user, existing)) throw new ForbiddenError("Only the organiser can delete this meeting.");
  await db.$transaction(async (tx) => {
    // Action items stay in people's task lists; they're just unlinked (FK is SET NULL).
    await tx.meeting.delete({ where: { id } });
    await audit(
      user,
      {
        action: "meeting.deleted",
        module: "meetings",
        entityType: "Meeting",
        entityId: id,
        summary: `${user.name} deleted the meeting “${existing.title}”`,
        before: { title: existing.title, startsAt: existing.startsAt, type: existing.type },
      },
      tx,
    );
  });
}

export async function respondToMeeting(user: SessionUser, id: string, response: Exclude<AttendeeResponse, "PENDING">) {
  const existing = await loadForAccess(user, id);
  if (!existing.attendees.some((a) => a.userId === user.id)) throw new ForbiddenError("You're not on the invite list for this meeting.");
  await db.meetingAttendee.update({ where: { meetingId_userId: { meetingId: id, userId: user.id } }, data: { response } });
  if (existing.organizerId !== user.id && response === "DECLINED") {
    await notify({
      userIds: [existing.organizerId],
      type: "MEETING_INVITATION",
      title: `${user.name} declined “${existing.title}”`,
      link: `/meetings/${id}`,
    });
  }
  await audit(user, {
    action: "meeting.responded",
    module: "meetings",
    entityType: "Meeting",
    entityId: id,
    summary: `${user.name} replied “${ATTENDEE_RESPONSE[response].label}” to “${existing.title}”`,
    after: { response },
  });
}

export async function saveMeetingNotes(user: SessionUser, id: string, input: { agenda?: string; notes?: string }) {
  const existing = await loadForAccess(user, id);
  if (!canRecordMeeting(user, existing)) throw new ForbiddenError("Only attendees can take notes for this meeting.");
  const data = { agenda: input.agenda ?? null, notes: input.notes ?? null };
  const changes = diffFields(existing, data);
  if (!changes) return;
  await db.meeting.update({ where: { id }, data });
  await audit(user, {
    action: "meeting.notes_updated",
    module: "meetings",
    entityType: "Meeting",
    entityId: id,
    summary: `${user.name} updated the ${Object.keys(changes.after).join(" and ")} for “${existing.title}”`,
    // Notes can be long; keep only which fields changed, not full copies.
    after: { fields: Object.keys(changes.after) },
  });
}

export async function setAttendance(user: SessionUser, id: string, attendedIds: string[]) {
  const existing = await loadForAccess(user, id);
  if (!canRecordMeeting(user, existing)) throw new ForbiddenError("Only attendees can record attendance.");
  if (existing.startsAt > new Date()) throw new ValidationError("Attendance can be recorded once the meeting has started.");
  const present = new Set(attendedIds);
  await db.$transaction([
    db.meetingAttendee.updateMany({ where: { meetingId: id, userId: { in: [...present] } }, data: { attended: true } }),
    db.meetingAttendee.updateMany({ where: { meetingId: id, userId: { notIn: [...present] } }, data: { attended: false } }),
  ]);
  await audit(user, {
    action: "meeting.attendance_recorded",
    module: "meetings",
    entityType: "Meeting",
    entityId: id,
    summary: `${user.name} recorded attendance for “${existing.title}” (${present.size} of ${existing.attendees.length} present)`,
    after: { attended: [...present] },
  });
}

export async function addDecision(user: SessionUser, meetingId: string, description: string) {
  const existing = await loadForAccess(user, meetingId);
  if (!canRecordMeeting(user, existing)) throw new ForbiddenError("Only attendees can record decisions.");
  const decision = await db.meetingDecision.create({ data: { meetingId, description, recordedById: user.id } });
  await audit(user, {
    action: "meeting.decision_recorded",
    module: "meetings",
    entityType: "Meeting",
    entityId: meetingId,
    summary: `${user.name} recorded a decision in “${existing.title}”: ${description.length > 120 ? `${description.slice(0, 117)}…` : description}`,
    after: { decision: description },
    feed: existing.type !== "BOARD",
  });
  return decision;
}

export async function deleteDecision(user: SessionUser, decisionId: string) {
  const decision = await db.meetingDecision.findUnique({ where: { id: decisionId } });
  if (!decision) throw new NotFoundError("Decision");
  const meeting = await loadForAccess(user, decision.meetingId);
  if (decision.recordedById !== user.id && !canEditMeeting(user, meeting)) throw new ForbiddenError("Only the person who recorded it or the organiser can remove this decision.");
  await db.meetingDecision.delete({ where: { id: decisionId } });
  await audit(user, {
    action: "meeting.decision_removed",
    module: "meetings",
    entityType: "Meeting",
    entityId: meeting.id,
    summary: `${user.name} removed a decision from “${meeting.title}”`,
    before: { decision: decision.description },
  });
}

export interface ActionItemInput {
  title: string;
  assigneeId: string;
  dueDate?: Date;
  priority: Priority;
  description?: string;
}

/**
 * Records an action item as a real Task linked to the meeting, so it appears in
 * the assignee's task list, notifications and deadline reminders.
 */
export async function addActionItem(user: SessionUser, meetingId: string, input: ActionItemInput) {
  const meeting = await loadForAccess(user, meetingId);
  if (!canRecordMeeting(user, meeting)) throw new ForbiddenError("Only attendees can add action items.");
  const participants = new Set([meeting.organizerId, ...meeting.attendees.map((a) => a.userId)]);
  if (!participants.has(input.assigneeId)) {
    throw new ValidationError("Action items can only be assigned to people in the meeting.", { assigneeId: ["Choose the organiser or an attendee."] });
  }
  return db.$transaction((tx) =>
    createTask(
      user,
      {
        title: input.title,
        description: input.description ?? `Action item from “${meeting.title}” (${formatDateTime(meeting.startsAt)}).`,
        status: "TODO",
        priority: input.priority,
        dueDate: input.dueDate,
        assigneeId: input.assigneeId,
        meetingId,
        schoolId: meeting.schoolId && can(user, "schools.read") ? meeting.schoolId : undefined,
      },
      tx,
      { assigneePreAuthorised: true },
    ),
  );
}
