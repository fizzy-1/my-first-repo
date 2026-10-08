import "server-only";
import type { BillingFrequency, PartnershipStatus, Prisma, Province, SchoolStage, SchoolType } from "@prisma/client";
import { addDays, dbDate, startOfDay } from "@/lib/dates";
import { formatZAR } from "@/lib/format";
import { SCHOOL_STAGE } from "@/lib/labels";
import { audit, diffFields } from "@/server/audit";
import { assertCan, type SessionUser } from "@/server/auth/current-user";
import { sortBy } from "@/server/sql";
import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { notify } from "@/server/notify";
import { meetingsVisibleWhere } from "./access";
import { documentsVisibleWhere } from "./document-access";
import { tasksVisibleWhere } from "./tasks";

/** Default win probability per stage (used when a school moves stage). */
export const STAGE_PROBABILITY: Record<SchoolStage, number> = {
  PROSPECT: 10,
  CONTACTED: 20,
  MEETING: 35,
  PROPOSAL: 50,
  NEGOTIATION: 70,
  PARTNERSHIP: 95,
  ACTIVE: 100,
  LOST: 0,
};

export async function schoolOptions() {
  const schools = await db.school.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, city: true } });
  return schools.map((s) => ({ value: s.id, label: s.name, hint: s.city }));
}

export type SchoolSort = "name" | "stage" | "expectedAnnualValue" | "nextFollowUpAt" | "potentialLearners" | "updatedAt";

export async function listSchools(
  user: SessionUser,
  opts: {
    q?: string;
    stage?: SchoolStage;
    province?: Province;
    ownerId?: string;
    followUp?: "overdue" | "week";
    sort: SchoolSort;
    dir: "asc" | "desc";
    skip: number;
    take: number;
  },
) {
  assertCan(user, "schools.read");
  const now = new Date();
  const where: Prisma.SchoolWhereInput = {
    AND: [
      opts.stage ? { stage: opts.stage } : {},
      opts.province ? { province: opts.province } : {},
      opts.ownerId ? { ownerId: opts.ownerId } : {},
      opts.followUp === "overdue" ? { nextFollowUpAt: { lt: startOfDay(now) }, stage: { notIn: ["LOST"] } } : {},
      opts.followUp === "week" ? { nextFollowUpAt: { gte: startOfDay(now), lt: addDays(startOfDay(now), 8) } } : {},
      opts.q
        ? {
            OR: [
              { name: { contains: opts.q, mode: "insensitive" } },
              { city: { contains: opts.q, mode: "insensitive" } },
              { emisNumber: { contains: opts.q } },
              { contacts: { some: { name: { contains: opts.q, mode: "insensitive" } } } },
            ],
          }
        : {},
    ],
  };
  const [total, rows, totals] = await Promise.all([
    db.school.count({ where }),
    db.school.findMany({
      where,
      orderBy: [sortBy(opts.sort, opts.dir, ["nextFollowUpAt"]), { name: "asc" }],
      skip: opts.skip,
      take: opts.take,
      include: {
        owner: { select: { id: true, name: true } },
        contacts: { where: { isPrimary: true }, take: 1, select: { name: true, position: true, email: true, phone: true } },
      },
    }),
    db.school.aggregate({ where, _sum: { expectedAnnualValue: true, potentialLearners: true } }),
  ]);
  return {
    total,
    totals: { value: Number(totals._sum.expectedAnnualValue ?? 0), learners: totals._sum.potentialLearners ?? 0 },
    rows: rows.map((s) => ({ ...s, expectedAnnualValue: Number(s.expectedAnnualValue), primaryContact: s.contacts[0] ?? null })),
  };
}

export async function schoolBoard(user: SessionUser, opts: { ownerId?: string; province?: Province; q?: string }) {
  assertCan(user, "schools.read");
  const schools = await db.school.findMany({
    where: {
      ...(opts.ownerId ? { ownerId: opts.ownerId } : {}),
      ...(opts.province ? { province: opts.province } : {}),
      ...(opts.q ? { name: { contains: opts.q, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ expectedAnnualValue: "desc" }],
    select: {
      id: true,
      name: true,
      city: true,
      province: true,
      stage: true,
      expectedAnnualValue: true,
      probability: true,
      potentialLearners: true,
      nextFollowUpAt: true,
      owner: { select: { name: true } },
    },
  });
  return schools.map((s) => ({ ...s, expectedAnnualValue: Number(s.expectedAnnualValue), nextFollowUpAt: s.nextFollowUpAt?.toISOString() ?? null }));
}

export async function getSchool(user: SessionUser, id: string) {
  assertCan(user, "schools.read");
  const school = await db.school.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      partnerships: { orderBy: { startDate: "desc" }, include: { contractDocument: { select: { id: true, title: true } } } },
    },
  });
  if (!school) throw new NotFoundError("School");
  const [meetings, documents, tasks, income, learners] = await Promise.all([
    db.meeting.findMany({
      where: { AND: [{ schoolId: id }, meetingsVisibleWhere(user)] },
      orderBy: { startsAt: "desc" },
      take: 10,
      select: { id: true, title: true, startsAt: true, status: true, type: true },
    }),
    db.document.findMany({
      where: { AND: [{ schoolId: id }, documentsVisibleWhere(user), { archivedAt: null }] },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, category: true, currentVersion: true, updatedAt: true },
    }),
    db.task.findMany({
      where: { AND: [{ schoolId: id }, tasksVisibleWhere(user)] },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      select: { id: true, number: true, title: true, status: true, dueDate: true, assignee: { select: { name: true } } },
    }),
    db.income.aggregate({ where: { schoolId: id, status: { not: "CANCELLED" } }, _sum: { amount: true } }),
    db.learner.count({ where: { schoolId: id, status: "ACTIVE" } }),
  ]);
  return {
    ...school,
    expectedAnnualValue: Number(school.expectedAnnualValue),
    partnerships: school.partnerships.map((p) => ({ ...p, annualValue: Number(p.annualValue) })),
    meetings,
    documents,
    tasks,
    invoicedToDate: Number(income._sum.amount ?? 0),
    activeLearners: learners,
  };
}

export interface SchoolInput {
  name: string;
  emisNumber?: string;
  type: SchoolType;
  province: Province;
  city: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  learnerCount: number;
  potentialLearners: number;
  stage: SchoolStage;
  expectedAnnualValue: number;
  probability?: number;
  ownerId?: string;
  nextFollowUpAt?: Date;
  source?: string;
  lostReason?: string;
}

function schoolData(input: SchoolInput) {
  return {
    name: input.name,
    emisNumber: input.emisNumber ?? null,
    type: input.type,
    province: input.province,
    city: input.city,
    address: input.address ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    website: input.website ?? null,
    learnerCount: input.learnerCount,
    potentialLearners: input.potentialLearners,
    stage: input.stage,
    expectedAnnualValue: input.expectedAnnualValue,
    probability: input.probability ?? STAGE_PROBABILITY[input.stage],
    ownerId: input.ownerId ?? null,
    nextFollowUpAt: input.nextFollowUpAt ?? null,
    source: input.source ?? null,
    lostReason: input.stage === "LOST" ? (input.lostReason ?? null) : null,
  };
}

export async function createSchool(user: SessionUser, input: SchoolInput) {
  assertCan(user, "schools.write");
  const school = await db.school.create({ data: { ...schoolData({ ...input, ownerId: input.ownerId ?? user.id }) } });
  await audit(user, {
    action: "school.created",
    module: "schools",
    entityType: "School",
    entityId: school.id,
    summary: `${user.name} added ${school.name} to the school pipeline (${SCHOOL_STAGE[school.stage].label})`,
    after: { name: school.name, stage: school.stage, expectedAnnualValue: input.expectedAnnualValue },
    feed: true,
  });
  if (school.ownerId && school.ownerId !== user.id) {
    await notify({ userIds: [school.ownerId], type: "TASK_ASSIGNED", title: `You now own ${school.name}`, body: `${user.name} assigned this school to you.`, link: `/schools/${school.id}` });
  }
  return school;
}

export async function updateSchool(user: SessionUser, id: string, input: SchoolInput) {
  assertCan(user, "schools.write");
  const existing = await db.school.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("School");
  const data = schoolData(input);
  const changes = diffFields(existing, data);
  if (!changes) return;
  const stageChanged = existing.stage !== input.stage;
  await db.school.update({ where: { id }, data: { ...data, ...(stageChanged ? { stageChangedAt: new Date() } : {}) } });
  await audit(user, {
    action: stageChanged ? "school.stage_changed" : "school.updated",
    module: "schools",
    entityType: "School",
    entityId: id,
    summary: stageChanged
      ? `${user.name} moved ${existing.name} from ${SCHOOL_STAGE[existing.stage].label} to ${SCHOOL_STAGE[input.stage].label}`
      : `${user.name} updated ${existing.name} (${Object.keys(changes.after).join(", ")})`,
    ...changes,
    feed: stageChanged,
  });
  if (input.ownerId && input.ownerId !== existing.ownerId && input.ownerId !== user.id) {
    await notify({ userIds: [input.ownerId], type: "TASK_ASSIGNED", title: `You now own ${existing.name}`, body: `${user.name} assigned this school to you.`, link: `/schools/${id}` });
  }
}

export async function moveSchoolStage(user: SessionUser, id: string, stage: SchoolStage) {
  assertCan(user, "schools.write");
  const existing = await db.school.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("School");
  if (existing.stage === stage) return;
  await db.school.update({
    where: { id },
    data: { stage, stageChangedAt: new Date(), probability: STAGE_PROBABILITY[stage], ...(stage !== "LOST" ? { lostReason: null } : {}) },
  });
  await audit(user, {
    action: "school.stage_changed",
    module: "schools",
    entityType: "School",
    entityId: id,
    summary: `${user.name} moved ${existing.name} from ${SCHOOL_STAGE[existing.stage].label} to ${SCHOOL_STAGE[stage].label}`,
    before: { stage: existing.stage, probability: existing.probability },
    after: { stage, probability: STAGE_PROBABILITY[stage] },
    feed: true,
  });
}

export async function deleteSchool(user: SessionUser, id: string) {
  assertCan(user, "schools.write");
  const existing = await db.school.findUnique({ where: { id }, include: { _count: { select: { partnerships: true, income: true } } } });
  if (!existing) throw new NotFoundError("School");
  if (existing._count.partnerships || existing._count.income) {
    throw new ValidationError("Schools with partnerships or invoices can't be deleted. Mark the school as Lost instead.");
  }
  await db.school.delete({ where: { id } });
  await audit(user, {
    action: "school.deleted",
    module: "schools",
    entityType: "School",
    entityId: id,
    summary: `${user.name} deleted school ${existing.name}`,
    before: { name: existing.name, stage: existing.stage },
  });
}

export async function setFollowUp(user: SessionUser, id: string, at: Date | null) {
  assertCan(user, "schools.write");
  const existing = await db.school.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("School");
  await db.school.update({ where: { id }, data: { nextFollowUpAt: at } });
  await audit(user, {
    action: "school.follow_up",
    module: "schools",
    entityType: "School",
    entityId: id,
    summary: at ? `${user.name} set a follow-up for ${existing.name}` : `${user.name} cleared the follow-up for ${existing.name}`,
    before: { nextFollowUpAt: existing.nextFollowUpAt },
    after: { nextFollowUpAt: at },
  });
}

// ─────────────────────────── Contacts & notes ───────────────────────────

export interface ContactInput {
  name: string;
  position: string;
  email?: string;
  phone?: string;
  isPrimary: boolean;
}

export async function saveContact(user: SessionUser, schoolId: string, contactId: string | null, input: ContactInput) {
  assertCan(user, "schools.write");
  const school = await db.school.findUnique({ where: { id: schoolId } });
  if (!school) throw new NotFoundError("School");
  await db.$transaction(async (tx) => {
    if (input.isPrimary) await tx.schoolContact.updateMany({ where: { schoolId }, data: { isPrimary: false } });
    const data = { name: input.name, position: input.position, email: input.email ?? null, phone: input.phone ?? null, isPrimary: input.isPrimary };
    if (contactId) {
      const existing = await tx.schoolContact.findFirst({ where: { id: contactId, schoolId } });
      if (!existing) throw new NotFoundError("Contact");
      await tx.schoolContact.update({ where: { id: contactId }, data });
    } else {
      await tx.schoolContact.create({ data: { ...data, schoolId } });
    }
    await audit(
      user,
      {
        action: contactId ? "school.contact_updated" : "school.contact_added",
        module: "schools",
        entityType: "School",
        entityId: schoolId,
        summary: `${user.name} ${contactId ? "updated" : "added"} contact ${input.name} (${input.position}) at ${school.name}`,
        after: data,
      },
      tx,
    );
  });
}

export async function deleteContact(user: SessionUser, contactId: string) {
  assertCan(user, "schools.write");
  const contact = await db.schoolContact.findUnique({ where: { id: contactId }, include: { school: { select: { name: true } } } });
  if (!contact) throw new NotFoundError("Contact");
  await db.schoolContact.delete({ where: { id: contactId } });
  await audit(user, {
    action: "school.contact_removed",
    module: "schools",
    entityType: "School",
    entityId: contact.schoolId,
    summary: `${user.name} removed contact ${contact.name} from ${contact.school.name}`,
    before: { name: contact.name, position: contact.position, email: contact.email },
  });
}

export async function addSchoolNote(user: SessionUser, schoolId: string, body: string) {
  assertCan(user, "schools.write");
  const school = await db.school.findUnique({ where: { id: schoolId } });
  if (!school) throw new NotFoundError("School");
  await db.schoolNote.create({ data: { schoolId, authorId: user.id, body } });
  await audit(user, {
    action: "school.note_added",
    module: "schools",
    entityType: "School",
    entityId: schoolId,
    summary: `${user.name} added a note to ${school.name}`,
  });
}

// ─────────────────────────── Partnerships ───────────────────────────

export interface PartnershipInput {
  status: PartnershipStatus;
  startDate: Date;
  endDate?: Date;
  annualValue: number;
  learnersCovered: number;
  billingFrequency: BillingFrequency;
  contractDocumentId?: string;
  notes?: string;
}

export async function savePartnership(user: SessionUser, schoolId: string, partnershipId: string | null, input: PartnershipInput) {
  assertCan(user, "schools.write");
  const school = await db.school.findUnique({ where: { id: schoolId } });
  if (!school) throw new NotFoundError("School");
  if (input.endDate && input.endDate < input.startDate) throw new ValidationError("End date must be after the start date.", { endDate: ["Must be after the start date."] });
  const data = {
    status: input.status,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    annualValue: input.annualValue,
    learnersCovered: input.learnersCovered,
    billingFrequency: input.billingFrequency,
    contractDocumentId: input.contractDocumentId ?? null,
    notes: input.notes ?? null,
    signedAt: input.status === "SIGNED" || input.status === "ACTIVE" ? new Date() : null,
  };
  let before: Record<string, unknown> | null = null;
  if (partnershipId) {
    const existing = await db.partnership.findFirst({ where: { id: partnershipId, schoolId } });
    if (!existing) throw new NotFoundError("Partnership");
    before = { status: existing.status, annualValue: Number(existing.annualValue), endDate: existing.endDate };
    await db.partnership.update({ where: { id: partnershipId }, data: { ...data, signedAt: existing.signedAt ?? data.signedAt } });
  } else {
    await db.partnership.create({ data: { ...data, schoolId } });
  }
  // Keep the pipeline stage in step with the contract.
  const stage: SchoolStage | null =
    input.status === "ACTIVE" ? "ACTIVE" : input.status === "SIGNED" ? "PARTNERSHIP" : null;
  if (stage && school.stage !== stage) {
    await db.school.update({ where: { id: schoolId }, data: { stage, stageChangedAt: new Date(), probability: STAGE_PROBABILITY[stage], expectedAnnualValue: input.annualValue } });
  }
  await audit(user, {
    action: partnershipId ? "partnership.updated" : input.status === "SIGNED" || input.status === "ACTIVE" ? "partnership.signed" : "partnership.created",
    module: "schools",
    entityType: "Partnership",
    entityId: partnershipId ?? schoolId,
    summary: partnershipId
      ? `${user.name} updated the partnership with ${school.name} (${input.status.toLowerCase()}, ${formatZAR(input.annualValue)}/yr)`
      : `${user.name} recorded a ${input.status.toLowerCase()} partnership with ${school.name} (${formatZAR(input.annualValue)}/yr)`,
    before,
    after: { status: input.status, annualValue: input.annualValue, endDate: input.endDate ?? null },
    feed: !partnershipId || before?.status !== input.status,
  });
}

/** Partnerships whose contracts end within `days` (renewal pipeline). */
export async function upcomingRenewals(days = 60) {
  const rows = await db.partnership.findMany({
    where: { status: { in: ["ACTIVE", "SIGNED"] }, endDate: { gte: dbDate(new Date()), lte: dbDate(addDays(new Date(), days)) } },
    include: { school: { select: { id: true, name: true, owner: { select: { name: true } } } } },
    orderBy: { endDate: "asc" },
  });
  return rows.map((p) => ({ ...p, annualValue: Number(p.annualValue) }));
}

export async function schoolDocumentOptions(user: SessionUser) {
  const docs = await db.document.findMany({
    where: { AND: [documentsVisibleWhere(user), { category: { in: ["SCHOOLS", "LEGAL"] } }, { archivedAt: null }] },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true },
  });
  return docs.map((d) => ({ value: d.id, label: d.title }));
}
