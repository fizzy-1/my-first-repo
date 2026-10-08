"use server";

import { BugSeverity, BugStatus, FeatureStatus, Priority } from "@prisma/client";
import { z } from "zod";
import { argAction, formAction } from "@/server/action";
import { zEnum, zId, zOptionalDate, zOptionalEnum, zOptionalId, zOptionalText, zText } from "@/lib/validation";
import { BUG_STATUS, FEATURE_STATUS } from "@/lib/labels";
import { deleteBug, deleteFeature, moveFeature, reportBug, saveFeature, setBugStatus, updateBug } from "@/server/services/technology";

const featureSchema = z.object({
  id: zOptionalId,
  title: zText(160, "Feature"),
  description: zOptionalText(3000),
  priority: zEnum(Priority, "a priority"),
  status: zEnum(FeatureStatus, "a status"),
  ownerId: zOptionalId,
  targetDate: zOptionalDate,
});

export const saveFeatureAction = formAction(featureSchema, async (user, { id, ...input }) => {
  const saved = await saveFeature(user, id ?? null, input);
  return { message: id ? "Feature updated" : "Feature added to the roadmap", id: saved };
});

export const moveFeatureAction = argAction(z.object({ id: zId, status: zEnum(FeatureStatus) }), async (user, { id, status }) => {
  await moveFeature(user, id, status);
  return `Moved to ${FEATURE_STATUS[status].label}`;
});

export const deleteFeatureAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteFeature(user, id);
  return "Feature removed";
});

const bugSchema = z.object({
  title: zText(200, "Bug summary"),
  description: zOptionalText(5000),
  severity: zEnum(BugSeverity, "a severity"),
  environment: zOptionalText(100),
  assigneeId: zOptionalId,
  featureId: zOptionalId,
  status: zOptionalEnum(BugStatus),
});

export const reportBugAction = formAction(bugSchema, async (user, input) => {
  const bug = await reportBug(user, input);
  return { message: `Bug #${bug.number} reported`, id: bug.id };
});

export const updateBugAction = formAction(bugSchema.extend({ id: zId }), async (user, { id, ...input }) => {
  await updateBug(user, id, input);
  return "Bug updated";
});

export const setBugStatusAction = argAction(z.object({ id: zId, status: zEnum(BugStatus) }), async (user, { id, status }) => {
  await setBugStatus(user, id, status);
  return `Marked as ${BUG_STATUS[status].label.toLowerCase()}`;
});

export const deleteBugAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteBug(user, id);
  return "Bug deleted";
});
