import "server-only";
import { Prisma, type ContentStage, type ContentType, type Priority, type TimeEntryStatus, type TutorActivity } from "@prisma/client";
import { addDays, dbDate, startOfMonth, startOfWeek } from "@/lib/dates";
import { CONTENT_STAGE } from "@/lib/labels";
import { percentChange } from "@/lib/utils";
import { audit, diffFields } from "@/server/audit";
import { assertCan, can, canAny, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { learnerPlatform } from "@/server/integrations/learner-platform";
import { notify } from "@/server/notify";

function assertAcademicAccess(user: SessionUser) {
  if (!canAny(user, ["academic.read", "academic.read.assigned"])) throw new ForbiddenError();
}

/** Content a user may see: everything (academic.read) or items they create or review. */
export function contentVisibleWhere(user: SessionUser): Prisma.ContentItemWhereInput {
  if (can(user, "academic.read")) return {};
  return { OR: [{ assigneeId: user.id }, { reviewerId: user.id }] };
}

/** Tutors may move their own items through production up to Review; approval and publishing need academic.write. */
const ASSIGNEE_STAGES: ContentStage[] = ["PLANNED", "RECORDING", "EDITING", "REVIEW"];

export function canMoveContent(user: SessionUser, item: { assigneeId: string | null; stage: ContentStage }, to: ContentStage) {
  if (can(user, "academic.write")) return true;
  return item.assigneeId === user.id && ASSIGNEE_STAGES.includes(item.stage) && ASSIGNEE_STAGES.includes(to);
}

// ─────────────────────────── Overview ───────────────────────────

export async function academicOverview(user: SessionUser) {
  assertAcademicAccess(user);
  const scope = contentVisibleWhere(user);
  const now = new Date();
  const weekStart = startOfWeek(now);
  const [byStage, publishedThisMonth, overdue, engagement, hoursThisMonth] = await Promise.all([
    db.contentItem.groupBy({ by: ["stage"], where: scope, _count: true }),
    db.contentItem.count({ where: { AND: [scope, { stage: "PUBLISHED", publishedAt: { gte: startOfMonth(now) } }] } }),
    db.contentItem.count({ where: { AND: [scope, { stage: { not: "PUBLISHED" }, dueDate: { lt: dbDate(now) } }] } }),
    can(user, "academic.read") ? learnerPlatform.engagementSeries(addDays(weekStart, -7 * 16), addDays(weekStart, 7)) : Promise.resolve([]),
    db.tutorTimeEntry.aggregate({
      where: { date: { gte: dbDate(startOfMonth(now)) }, status: { not: "REJECTED" }, ...(can(user, "academic.read") ? {} : { tutor: { userId: user.id } }) },
      _sum: { hours: true },
    }),
  ]);
  const stageCount = Object.fromEntries(byStage.map((s) => [s.stage, s._count])) as Partial<Record<ContentStage, number>>;
  const last = engagement.at(-1);
  const prev = engagement.at(-2);
  return {
    stageCount,
    publishedThisMonth,
    overdue,
    inProduction: (stageCount.RECORDING ?? 0) + (stageCount.EDITING ?? 0),
    inReview: stageCount.REVIEW ?? 0,
    hoursThisMonth: Number(hoursThisMonth._sum.hours ?? 0),
    engagement: engagement.map((e) => ({ ...e, label: e.key.slice(5).split("-").reverse().join("/") })),
    weeklyActive: last?.activeLearners ?? null,
    weeklyActiveGrowth: last && prev ? percentChange(last.activeLearners, prev.activeLearners) : null,
    avgQuizScore: last?.avgQuizScore ?? null,
  };
}

// ─────────────────────────── Content pipeline ───────────────────────────

export interface ContentFilters {
  q?: string;
  stage?: ContentStage;
  type?: ContentType;
  courseId?: string;
  assigneeId?: string;
  overdue?: boolean;
}

function contentWhere(user: SessionUser, f: ContentFilters): Prisma.ContentItemWhereInput {
  return {
    AND: [
      contentVisibleWhere(user),
      f.stage ? { stage: f.stage } : {},
      f.type ? { type: f.type } : {},
      f.courseId ? { courseId: f.courseId } : {},
      f.assigneeId ? { assigneeId: f.assigneeId } : {},
      f.overdue ? { stage: { not: "PUBLISHED" }, dueDate: { lt: dbDate(new Date()) } } : {},
      f.q ? { title: { contains: f.q, mode: "insensitive" } } : {},
    ],
  };
}

export async function contentBoard(user: SessionUser, filters: ContentFilters) {
  assertAcademicAccess(user);
  const rows = await db.contentItem.findMany({
    where: contentWhere(user, filters),
    orderBy: [{ priority: "desc" }, { dueDate: { sort: "asc", nulls: "last" } }],
    take: 500,
    include: {
      course: { select: { id: true, title: true } },
      topic: { select: { title: true } },
      assignee: { select: { id: true, name: true } },
    },
  });
  return rows.map((r) => ({ ...r, estimatedHours: r.estimatedHours ? Number(r.estimatedHours) : null }));
}

export async function listContent(user: SessionUser, filters: ContentFilters & { sort: "dueDate" | "title" | "stage" | "updatedAt"; dir: "asc" | "desc"; skip: number; take: number }) {
  assertAcademicAccess(user);
  const where = contentWhere(user, filters);
  const [total, rows] = await Promise.all([
    db.contentItem.count({ where }),
    db.contentItem.findMany({
      where,
      orderBy: [filters.sort === "dueDate" ? { dueDate: { sort: filters.dir, nulls: "last" } } : { [filters.sort]: filters.dir }, { title: "asc" }],
      skip: filters.skip,
      take: filters.take,
      include: {
        course: { select: { id: true, title: true } },
        topic: { select: { title: true } },
        assignee: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
      },
    }),
  ]);
  return { total, rows: rows.map((r) => ({ ...r, estimatedHours: r.estimatedHours ? Number(r.estimatedHours) : null, canMove: can(user, "academic.write") || r.assigneeId === user.id })) };
}

export async function moveContentStage(user: SessionUser, id: string, stage: ContentStage) {
  assertAcademicAccess(user);
  const item = await db.contentItem.findFirst({ where: { AND: [{ id }, contentVisibleWhere(user)] } });
  if (!item) throw new NotFoundError("Content item");
  if (item.stage === stage) return;
  if (!canMoveContent(user, item, stage)) {
    throw new ForbiddenError(stage === "APPROVED" || stage === "PUBLISHED" ? "Only the Head Tutor can approve or publish content." : "You can only move content assigned to you.");
  }
  await db.contentItem.update({
    where: { id },
    data: { stage, stageChangedAt: new Date(), publishedAt: stage === "PUBLISHED" ? new Date() : stage === "APPROVED" ? item.publishedAt : null },
  });
  await audit(user, {
    action: stage === "PUBLISHED" ? "content.published" : "content.stage_changed",
    module: "academic",
    entityType: "ContentItem",
    entityId: id,
    summary: stage === "PUBLISHED" ? `${user.name} published “${item.title}”` : `${user.name} moved “${item.title}” from ${CONTENT_STAGE[item.stage].label} to ${CONTENT_STAGE[stage].label}`,
    before: { stage: item.stage },
    after: { stage },
    feed: stage === "PUBLISHED" || stage === "APPROVED",
  });
  if (stage === "REVIEW" && item.reviewerId) {
    await notify({ userIds: [item.reviewerId], excludeUserId: user.id, type: "TASK_ASSIGNED", title: `Ready for review: ${item.title}`, body: `${user.name} moved this item to Review.`, link: `/academic?q=${encodeURIComponent(item.title)}` });
  }
  if ((stage === "APPROVED" || stage === "PUBLISHED" || (item.stage === "REVIEW" && stage !== "REVIEW")) && item.assigneeId) {
    await notify({
      userIds: [item.assigneeId],
      excludeUserId: user.id,
      type: "SYSTEM",
      title: `${CONTENT_STAGE[stage].label}: ${item.title}`,
      body: `${user.name} moved your content item to ${CONTENT_STAGE[stage].label}.`,
      link: `/academic?q=${encodeURIComponent(item.title)}`,
    });
  }
}

export interface ContentInput {
  title: string;
  type: ContentType;
  stage: ContentStage;
  priority: Priority;
  courseId?: string;
  topicId?: string;
  assigneeId?: string;
  reviewerId?: string;
  dueDate?: Date;
  estimatedHours?: number;
  notes?: string;
}

async function validateTopic(input: ContentInput) {
  if (input.topicId) {
    const topic = await db.topic.findUnique({ where: { id: input.topicId } });
    if (!topic) throw new ValidationError("Unknown topic.");
    if (input.courseId && topic.courseId !== input.courseId) throw new ValidationError("The topic doesn't belong to the selected course.", { topicId: ["Choose a topic from the selected course."] });
    input.courseId = topic.courseId;
  }
}

export async function createContent(user: SessionUser, input: ContentInput) {
  assertCan(user, "academic.write");
  await validateTopic(input);
  const item = await db.contentItem.create({
    data: {
      title: input.title,
      type: input.type,
      stage: input.stage,
      priority: input.priority,
      courseId: input.courseId ?? null,
      topicId: input.topicId ?? null,
      assigneeId: input.assigneeId ?? null,
      reviewerId: input.reviewerId ?? user.id,
      dueDate: input.dueDate ?? null,
      estimatedHours: input.estimatedHours ?? null,
      notes: input.notes ?? null,
      publishedAt: input.stage === "PUBLISHED" ? new Date() : null,
    },
  });
  await audit(user, { action: "content.created", module: "academic", entityType: "ContentItem", entityId: item.id, summary: `${user.name} added “${item.title}” to the content pipeline`, after: { title: item.title, stage: item.stage, assigneeId: item.assigneeId } });
  if (item.assigneeId) {
    await notify({ userIds: [item.assigneeId], excludeUserId: user.id, type: "TASK_ASSIGNED", title: `New content assignment: ${item.title}`, body: input.dueDate ? `Due ${input.dueDate.toISOString().slice(0, 10)}.` : null, link: `/academic?q=${encodeURIComponent(item.title)}` });
  }
  return item;
}

export async function updateContent(user: SessionUser, id: string, input: ContentInput) {
  assertCan(user, "academic.write");
  const existing = await db.contentItem.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Content item");
  await validateTopic(input);
  const data = {
    title: input.title,
    type: input.type,
    stage: input.stage,
    priority: input.priority,
    courseId: input.courseId ?? null,
    topicId: input.topicId ?? null,
    assigneeId: input.assigneeId ?? null,
    reviewerId: input.reviewerId ?? null,
    dueDate: input.dueDate ?? null,
    estimatedHours: input.estimatedHours ?? null,
    notes: input.notes ?? null,
  };
  const changes = diffFields(existing, data);
  if (!changes) return;
  await db.contentItem.update({
    where: { id },
    data: { ...data, ...(existing.stage !== input.stage ? { stageChangedAt: new Date(), publishedAt: input.stage === "PUBLISHED" ? new Date() : null } : {}) },
  });
  await audit(user, { action: "content.updated", module: "academic", entityType: "ContentItem", entityId: id, summary: `${user.name} updated “${existing.title}” (${Object.keys(changes.after).join(", ")})`, ...changes });
  if (input.assigneeId && input.assigneeId !== existing.assigneeId) {
    await notify({ userIds: [input.assigneeId], excludeUserId: user.id, type: "TASK_ASSIGNED", title: `New content assignment: ${input.title}`, link: `/academic?q=${encodeURIComponent(input.title)}` });
  }
}

export async function deleteContent(user: SessionUser, id: string) {
  assertCan(user, "academic.write");
  const existing = await db.contentItem.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Content item");
  await db.contentItem.delete({ where: { id } });
  await audit(user, { action: "content.deleted", module: "academic", entityType: "ContentItem", entityId: id, summary: `${user.name} deleted “${existing.title}”`, before: { title: existing.title, stage: existing.stage } });
}

export async function courseAndTopicOptions() {
  const courses = await db.course.findMany({ orderBy: [{ grade: "desc" }, { title: "asc" }], include: { topics: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true } } } });
  return {
    courses: courses.map((c) => ({ value: c.id, label: c.title })),
    topics: courses.flatMap((c) => c.topics.map((t) => ({ value: t.id, label: t.title, hint: c.title }))),
  };
}

// ─────────────────────────── Courses ───────────────────────────

export async function listCourses(user: SessionUser) {
  assertAcademicAccess(user);
  const courses = await db.course.findMany({
    orderBy: [{ status: "asc" }, { grade: "desc" }, { title: "asc" }],
    include: {
      leadTutor: { select: { name: true } },
      topics: {
        orderBy: { sortOrder: "asc" },
        include: {
          lessons: { select: { status: true } },
          contentItems: { select: { stage: true } },
        },
      },
    },
  });
  const latest = await db.engagementSnapshot.findMany({ orderBy: { weekStart: "desc" }, distinct: ["courseId"], select: { courseId: true, activeLearners: true, avgQuizScore: true } });
  const byCourse = new Map(latest.map((l) => [l.courseId, l]));
  return courses.map((c) => {
    const topics = c.topics.map((t) => {
      const published = t.contentItems.filter((i) => i.stage === "PUBLISHED").length;
      return {
        id: t.id,
        title: t.title,
        capsTerm: t.capsTerm,
        lessons: t.lessons.length,
        lessonsPublished: t.lessons.filter((l) => l.status === "PUBLISHED").length,
        content: t.contentItems.length,
        contentPublished: published,
        coverage: t.contentItems.length ? (published / t.contentItems.length) * 100 : 0,
      };
    });
    const content = topics.reduce((s, t) => s + t.content, 0);
    const published = topics.reduce((s, t) => s + t.contentPublished, 0);
    const engagement = byCourse.get(c.id);
    return {
      id: c.id,
      title: c.title,
      subject: c.subject,
      grade: c.grade,
      status: c.status,
      description: c.description,
      leadTutor: c.leadTutor?.name ?? null,
      topics,
      content,
      published,
      coverage: content ? (published / content) * 100 : 0,
      weeklyActive: engagement?.activeLearners ?? null,
      avgQuizScore: engagement ? Number(engagement.avgQuizScore) : null,
    };
  });
}

// ─────────────────────────── Tutors & hours ───────────────────────────

export async function listTutors(user: SessionUser) {
  assertAcademicAccess(user);
  const since = dbDate(addDays(new Date(), -30));
  const tutors = await db.tutorProfile.findMany({
    where: can(user, "academic.read") ? {} : { userId: user.id },
    include: {
      user: { select: { id: true, name: true, jobTitle: true, status: true } },
      timeEntries: { where: { date: { gte: since }, status: { not: "REJECTED" } }, select: { hours: true, status: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  const workload = await db.contentItem.groupBy({
    by: ["assigneeId"],
    where: { stage: { not: "PUBLISHED" }, assigneeId: { in: tutors.map((t) => t.userId) } },
    _count: true,
  });
  const overdue = await db.contentItem.groupBy({
    by: ["assigneeId"],
    where: { stage: { not: "PUBLISHED" }, dueDate: { lt: dbDate(new Date()) }, assigneeId: { in: tutors.map((t) => t.userId) } },
    _count: true,
  });
  return tutors.map((t) => {
    const hours = t.timeEntries.reduce((s, e) => s + Number(e.hours), 0);
    const capacity = t.weeklyCapacityHours * (30 / 7);
    return {
      id: t.id,
      userId: t.userId,
      name: t.user.name,
      jobTitle: t.user.jobTitle,
      specialisation: t.specialisation,
      weeklyCapacityHours: t.weeklyCapacityHours,
      hourlyRate: can(user, "academic.hours.approve") || can(user, "finance.read") ? (t.hourlyRate ? Number(t.hourlyRate) : null) : null,
      hours30d: Math.round(hours * 10) / 10,
      pendingHours: Math.round(t.timeEntries.filter((e) => e.status === "SUBMITTED").reduce((s, e) => s + Number(e.hours), 0) * 10) / 10,
      utilisation: capacity ? (hours / capacity) * 100 : 0,
      openItems: workload.find((w) => w.assigneeId === t.userId)?._count ?? 0,
      overdueItems: overdue.find((w) => w.assigneeId === t.userId)?._count ?? 0,
    };
  });
}

export async function listTimeEntries(
  user: SessionUser,
  opts: { status?: TimeEntryStatus; tutorId?: string; mine?: boolean; skip: number; take: number },
) {
  assertAcademicAccess(user);
  const scope: Prisma.TutorTimeEntryWhereInput = can(user, "academic.hours.approve") && !opts.mine ? {} : { tutor: { userId: user.id } };
  const where: Prisma.TutorTimeEntryWhereInput = { AND: [scope, opts.status ? { status: opts.status } : {}, opts.tutorId ? { tutorId: opts.tutorId } : {}] };
  const [total, rows, sum] = await Promise.all([
    db.tutorTimeEntry.count({ where }),
    db.tutorTimeEntry.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: opts.skip,
      take: opts.take,
      include: { tutor: { include: { user: { select: { name: true } } } }, contentItem: { select: { title: true } }, approvedBy: { select: { name: true } } },
    }),
    db.tutorTimeEntry.aggregate({ where, _sum: { hours: true } }),
  ]);
  return {
    total,
    totalHours: Number(sum._sum.hours ?? 0),
    rows: rows.map((r) => ({ ...r, hours: Number(r.hours), isMine: r.tutor.userId === user.id })),
  };
}

export async function myTutorProfile(user: SessionUser) {
  return db.tutorProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
}

export async function logTime(user: SessionUser, input: { date: Date; hours: number; activity: TutorActivity; contentItemId?: string; description?: string }) {
  assertCan(user, "academic.hours.log");
  const profile = await myTutorProfile(user);
  if (!profile) throw new ValidationError("You don't have a tutor profile. Ask the Head Tutor to set one up.");
  if (input.date > dbDate(addDays(new Date(), 1))) throw new ValidationError("You can't log hours in the future.", { date: ["Choose today or an earlier date."] });
  if (input.contentItemId) {
    const item = await db.contentItem.findFirst({ where: { AND: [{ id: input.contentItemId }, contentVisibleWhere(user)] } });
    if (!item) throw new ValidationError("Unknown content item.");
  }
  const entry = await db.tutorTimeEntry.create({
    data: { tutorId: profile.id, date: input.date, hours: input.hours, activity: input.activity, contentItemId: input.contentItemId ?? null, description: input.description ?? null },
  });
  await audit(user, { action: "time.logged", module: "academic", entityType: "TutorTimeEntry", entityId: entry.id, summary: `${user.name} logged ${input.hours}h (${input.activity.toLowerCase().replace("_", " ")})`, after: { date: input.date, hours: input.hours } });
  return entry;
}

export async function decideTimeEntries(user: SessionUser, ids: string[], status: "APPROVED" | "REJECTED") {
  assertCan(user, "academic.hours.approve");
  const entries = await db.tutorTimeEntry.findMany({ where: { id: { in: ids }, status: "SUBMITTED" }, include: { tutor: { select: { userId: true } } } });
  const own = entries.filter((e) => e.tutor.userId === user.id);
  if (own.length) throw new ForbiddenError("You can't approve your own hours.");
  if (entries.length === 0) return 0;
  await db.tutorTimeEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { status, approvedById: user.id } });
  const hours = entries.reduce((s, e) => s + Number(e.hours), 0);
  await audit(user, {
    action: status === "APPROVED" ? "time.approved" : "time.rejected",
    module: "academic",
    entityType: "TutorTimeEntry",
    summary: `${user.name} ${status === "APPROVED" ? "approved" : "rejected"} ${entries.length} time entr${entries.length === 1 ? "y" : "ies"} (${hours}h)`,
    after: { ids: entries.map((e) => e.id), status },
  });
  await notify({
    userIds: [...new Set(entries.map((e) => e.tutor.userId))],
    type: "SYSTEM",
    title: `Your tutor hours were ${status === "APPROVED" ? "approved" : "rejected"}`,
    body: `${user.name} reviewed ${entries.length} entr${entries.length === 1 ? "y" : "ies"}.`,
    link: "/academic/hours",
  });
  return entries.length;
}

export async function deleteTimeEntry(user: SessionUser, id: string) {
  const entry = await db.tutorTimeEntry.findUnique({ where: { id }, include: { tutor: { select: { userId: true } } } });
  if (!entry) throw new NotFoundError("Time entry");
  if (entry.tutor.userId !== user.id) throw new ForbiddenError("You can only delete your own entries.");
  if (entry.status !== "SUBMITTED") throw new ValidationError("Approved or rejected entries can't be deleted.");
  await db.tutorTimeEntry.delete({ where: { id } });
  await audit(user, { action: "time.deleted", module: "academic", entityType: "TutorTimeEntry", entityId: id, summary: `${user.name} deleted a ${Number(entry.hours)}h time entry`, before: { date: entry.date, hours: Number(entry.hours) } });
}

export async function myContentOptions(user: SessionUser) {
  const items = await db.contentItem.findMany({
    where: { AND: [contentVisibleWhere(user), { stage: { not: "PUBLISHED" } }] },
    orderBy: { dueDate: { sort: "asc", nulls: "last" } },
    take: 100,
    select: { id: true, title: true },
  });
  return items.map((i) => ({ value: i.id, label: i.title }));
}
