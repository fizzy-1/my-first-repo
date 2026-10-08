"use server";

import { MeetingStatus, MeetingType, Priority } from "@prisma/client";
import { z } from "zod";
import { argAction, formAction } from "@/server/action";
import { zDateTime, zEnum, zId, zIdList, zOptionalDueDate, zOptionalId, zOptionalText, zText, zUrl } from "@/lib/validation";
import { MEETING_STATUS } from "@/lib/labels";
import {
  addActionItem,
  addDecision,
  createMeeting,
  deleteDecision,
  deleteMeeting,
  respondToMeeting,
  saveMeetingNotes,
  setAttendance,
  setMeetingStatus,
  updateMeeting,
} from "@/server/services/meetings";

const meetingSchema = z.object({
  title: zText(160, "Title"),
  type: zEnum(MeetingType, "a meeting type"),
  startsAt: zDateTime,
  endsAt: zDateTime,
  location: zOptionalText(200),
  videoLink: zUrl,
  agenda: zOptionalText(10000),
  schoolId: zOptionalId,
  attendeeIds: zIdList,
});

export const createMeetingAction = formAction(meetingSchema, async (user, input) => {
  const meeting = await createMeeting(user, input);
  return { message: "Meeting scheduled and invitations sent", id: meeting.id };
});

export const updateMeetingAction = formAction(meetingSchema.extend({ id: zId }), async (user, { id, ...input }) => {
  await updateMeeting(user, id, input);
  return "Meeting updated";
});

export const setMeetingStatusAction = argAction(z.object({ id: zId, status: zEnum(MeetingStatus) }), async (user, { id, status }) => {
  await setMeetingStatus(user, id, status);
  return `Marked as ${MEETING_STATUS[status].label.toLowerCase()}`;
});

export const deleteMeetingAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteMeeting(user, id);
  return "Meeting deleted";
});

export const respondToMeetingAction = argAction(
  z.object({ id: zId, response: z.enum(["ACCEPTED", "DECLINED", "TENTATIVE"]) }),
  async (user, { id, response }) => {
    await respondToMeeting(user, id, response);
    return response === "ACCEPTED" ? "See you there" : response === "DECLINED" ? "Declined" : "Marked as tentative";
  },
);

export const saveMeetingNotesAction = formAction(
  z.object({ id: zId, agenda: zOptionalText(10000), notes: zOptionalText(20000) }),
  async (user, { id, ...input }) => {
    await saveMeetingNotes(user, id, input);
    return "Notes saved";
  },
);

export const setAttendanceAction = formAction(z.object({ id: zId, attended: zIdList }), async (user, { id, attended }) => {
  await setAttendance(user, id, attended);
  return "Attendance recorded";
});

export const addDecisionAction = formAction(z.object({ meetingId: zId, description: zText(1000, "Decision") }), async (user, { meetingId, description }) => {
  await addDecision(user, meetingId, description);
  return "Decision recorded";
});

export const deleteDecisionAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteDecision(user, id);
  return "Decision removed";
});

export const addActionItemAction = formAction(
  z.object({
    meetingId: zId,
    title: zText(200, "Action item"),
    assigneeId: zId,
    dueDate: zOptionalDueDate,
    priority: zEnum(Priority, "a priority"),
  }),
  async (user, { meetingId, ...input }) => {
    const task = await addActionItem(user, meetingId, input);
    return { message: `Action item added as task #${task.number}`, id: task.id };
  },
);
