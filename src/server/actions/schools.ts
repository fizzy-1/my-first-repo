"use server";

import { BillingFrequency, PartnershipStatus, Province, SchoolStage, SchoolType } from "@prisma/client";
import { z } from "zod";
import { argAction, formAction } from "@/server/action";
import {
  zCheckbox,
  zDate,
  zEnum,
  zId,
  zInt,
  zMoney,
  zOptionalDate,
  zOptionalDueDate,
  zOptionalEmail,
  zOptionalId,
  zOptionalInt,
  zOptionalText,
  zText,
  zUrl,
} from "@/lib/validation";
import { SCHOOL_STAGE } from "@/lib/labels";
import {
  addSchoolNote,
  createSchool,
  deleteContact,
  deleteSchool,
  moveSchoolStage,
  saveContact,
  savePartnership,
  setFollowUp,
  updateSchool,
} from "@/server/services/schools";

const schoolSchema = z.object({
  name: zText(160, "School name"),
  emisNumber: zOptionalText(32),
  type: zEnum(SchoolType, "a school type"),
  province: zEnum(Province, "a province"),
  city: zText(80, "City"),
  address: zOptionalText(200),
  phone: zOptionalText(40),
  email: zOptionalEmail,
  website: zUrl,
  learnerCount: zInt(0, 10000),
  potentialLearners: zInt(0, 10000),
  stage: zEnum(SchoolStage, "a stage"),
  expectedAnnualValue: zMoney,
  probability: zOptionalInt(0, 100),
  ownerId: zOptionalId,
  nextFollowUpAt: zOptionalDueDate,
  source: zOptionalText(80),
  lostReason: zOptionalText(500),
});

export const createSchoolAction = formAction(schoolSchema, async (user, input) => {
  const school = await createSchool(user, input);
  return { message: `${school.name} added to the pipeline`, id: school.id };
});

export const updateSchoolAction = formAction(schoolSchema.extend({ id: zId }), async (user, { id, ...input }) => {
  await updateSchool(user, id, input);
  return "School updated";
});

export const moveSchoolStageAction = argAction(z.object({ id: zId, status: zEnum(SchoolStage) }), async (user, { id, status }) => {
  await moveSchoolStage(user, id, status);
  return `Moved to ${SCHOOL_STAGE[status].label}`;
});

export const deleteSchoolAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteSchool(user, id);
  return "School deleted";
});

export const setFollowUpAction = formAction(z.object({ id: zId, nextFollowUpAt: zOptionalDueDate }), async (user, { id, nextFollowUpAt }) => {
  await setFollowUp(user, id, nextFollowUpAt ?? null);
  return nextFollowUpAt ? "Follow-up reminder set" : "Follow-up cleared";
});

export const saveContactAction = formAction(
  z.object({
    schoolId: zId,
    contactId: zOptionalId,
    name: zText(120, "Name"),
    position: zText(120, "Position"),
    email: zOptionalEmail,
    phone: zOptionalText(40),
    isPrimary: zCheckbox,
  }),
  async (user, { schoolId, contactId, ...input }) => {
    await saveContact(user, schoolId, contactId ?? null, input);
    return contactId ? "Contact updated" : "Contact added";
  },
);

export const deleteContactAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteContact(user, id);
  return "Contact removed";
});

export const addSchoolNoteAction = formAction(z.object({ schoolId: zId, body: zText(4000, "Note") }), async (user, { schoolId, body }) => {
  await addSchoolNote(user, schoolId, body);
  return "Note added";
});

export const savePartnershipAction = formAction(
  z.object({
    schoolId: zId,
    partnershipId: zOptionalId,
    status: zEnum(PartnershipStatus, "a status"),
    startDate: zDate,
    endDate: zOptionalDate,
    annualValue: zMoney,
    learnersCovered: zInt(0, 10000),
    billingFrequency: zEnum(BillingFrequency, "a billing frequency"),
    contractDocumentId: zOptionalId,
    notes: zOptionalText(2000),
  }),
  async (user, { schoolId, partnershipId, ...input }) => {
    await savePartnership(user, schoolId, partnershipId ?? null, input);
    return partnershipId ? "Partnership updated" : "Partnership recorded";
  },
);
