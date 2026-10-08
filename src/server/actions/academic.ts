"use server";

import { ContentStage, ContentType, Priority, TutorActivity } from "@prisma/client";
import { z } from "zod";
import { argAction, formAction } from "@/server/action";
import { zDate, zDecimal, zEnum, zId, zOptionalDate, zOptionalId, zOptionalText, zText } from "@/lib/validation";
import { CONTENT_STAGE } from "@/lib/labels";
import { createContent, decideTimeEntries, deleteContent, deleteTimeEntry, logTime, moveContentStage, updateContent } from "@/server/services/academic";

const contentSchema = z.object({
  title: zText(200, "Title"),
  type: zEnum(ContentType, "a content type"),
  stage: zEnum(ContentStage, "a stage"),
  priority: zEnum(Priority, "a priority"),
  courseId: zOptionalId,
  topicId: zOptionalId,
  assigneeId: zOptionalId,
  reviewerId: zOptionalId,
  dueDate: zOptionalDate,
  estimatedHours: z.preprocess((v) => (v === "" || v === undefined ? undefined : Number(v)), z.number().min(0).max(500).optional()),
  notes: zOptionalText(2000),
});

export const createContentAction = formAction(contentSchema, async (user, input) => {
  const item = await createContent(user, input);
  return { message: "Content item added", id: item.id };
});

export const updateContentAction = formAction(contentSchema.extend({ id: zId }), async (user, { id, ...input }) => {
  await updateContent(user, id, input);
  return "Content item updated";
});

export const moveContentStageAction = argAction(z.object({ id: zId, status: zEnum(ContentStage) }), async (user, { id, status }) => {
  await moveContentStage(user, id, status);
  return `Moved to ${CONTENT_STAGE[status].label}`;
});

export const deleteContentAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteContent(user, id);
  return "Content item deleted";
});

export const logTimeAction = formAction(
  z.object({
    date: zDate,
    hours: zDecimal(0.25, 24),
    activity: zEnum(TutorActivity, "an activity"),
    contentItemId: zOptionalId,
    description: zOptionalText(500),
  }),
  async (user, input) => {
    await logTime(user, input);
    return `${input.hours}h logged`;
  },
);

export const decideTimeEntriesAction = argAction(
  z.object({ ids: z.array(zId).min(1).max(200), status: z.enum(["APPROVED", "REJECTED"]) }),
  async (user, { ids, status }) => {
    const n = await decideTimeEntries(user, ids, status);
    return `${n} entr${n === 1 ? "y" : "ies"} ${status === "APPROVED" ? "approved" : "rejected"}`;
  },
);

export const deleteTimeEntryAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteTimeEntry(user, id);
  return "Entry deleted";
});
