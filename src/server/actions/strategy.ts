"use server";

import { ObjectiveMetric, ObjectiveStatus } from "@prisma/client";
import { z } from "zod";
import { argAction, formAction } from "@/server/action";
import { zDate, zEnum, zId, zInt, zOptionalId, zOptionalText, zText } from "@/lib/validation";
import { OBJECTIVE_STATUS } from "@/lib/labels";
import { createObjective, deleteObjective, recordObjectiveUpdate, updateObjective } from "@/server/services/strategy";

/** Objective values fit DECIMAL(14,2); "R400,000" and "1 250.5" are accepted. */
const MAX_VALUE = 100_000_000_000;

const parseValue = (v: unknown) => {
  if (typeof v !== "string") return v;
  const cleaned = v.replace(/[R\s,]/gi, "");
  return cleaned === "" ? undefined : Number(cleaned);
};

const zValue = (label: string) =>
  z.preprocess(
    parseValue,
    z
      .number({ error: `Enter the ${label}.` })
      .finite(`Enter a valid ${label}.`)
      .min(-MAX_VALUE, "Value is too small.")
      .max(MAX_VALUE, "Value is too large.")
      .transform((n) => Math.round(n * 100) / 100),
  );

const zOptionalValue = z.preprocess(
  parseValue,
  z
    .number({ error: "Enter a number." })
    .finite("Enter a valid number.")
    .min(-MAX_VALUE, "Value is too small.")
    .max(MAX_VALUE, "Value is too large.")
    .transform((n) => Math.round(n * 100) / 100)
    .optional(),
);

/** "annual" or a quarter number; quarterly objectives need a parent (checked in the service). */
const zPeriod = z.enum(["annual", "1", "2", "3", "4"], { error: "Choose annual or a quarter." }).transform((p) => (p === "annual" ? undefined : Number(p)));

const objectiveSchema = z.object({
  title: zText(160, "Title"),
  description: zOptionalText(2000),
  year: zInt(2000, 2100),
  quarter: zPeriod,
  parentId: zOptionalId,
  ownerId: zId,
  departmentId: zOptionalId,
  metric: zEnum(ObjectiveMetric, "how progress is measured"),
  unit: zOptionalText(24),
  startValue: zValue("start value"),
  targetValue: zValue("target value"),
  deadline: zDate,
  status: zEnum(ObjectiveStatus, "a status"),
});

export const createObjectiveAction = formAction(objectiveSchema.extend({ currentValue: zOptionalValue }), async (user, input) => {
  const objective = await createObjective(user, input);
  return { message: "Objective created", id: objective.id };
});

export const updateObjectiveAction = formAction(objectiveSchema.extend({ id: zId }), async (user, { id, ...input }) => {
  await updateObjective(user, id, input);
  return "Objective updated";
});

export const recordObjectiveUpdateAction = formAction(
  z.object({ id: zId, value: zOptionalValue, status: zEnum(ObjectiveStatus, "a status"), note: zOptionalText(2000) }),
  async (user, input) => {
    await recordObjectiveUpdate(user, input);
    return `Progress recorded · ${OBJECTIVE_STATUS[input.status].label}`;
  },
);

export const deleteObjectiveAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteObjective(user, id);
  return "Objective deleted";
});
