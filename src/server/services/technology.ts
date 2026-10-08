import "server-only";
import type { BugSeverity, BugStatus, FeatureStatus, Prisma, Priority } from "@prisma/client";
import { BUG_SEVERITY, BUG_STATUS, FEATURE_STATUS } from "@/lib/labels";
import { audit, diffFields } from "@/server/audit";
import { assertCan, can, canAny, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { notify } from "@/server/notify";
import { usersWithPermission } from "@/server/rbac";
import { bugsVisibleWhere } from "./access";
import { tasksVisibleWhere } from "./tasks";

function assertTechAccess(user: SessionUser) {
  if (!canAny(user, ["technology.read", "technology.read.assigned"])) throw new ForbiddenError();
}

/** Bugs: all with technology.read; otherwise those assigned to or reported by the user. */
export { bugsVisibleWhere };

// ─────────────────────────── Roadmap ───────────────────────────

export async function listFeatures(user: SessionUser) {
  assertTechAccess(user);
  const features = await db.feature.findMany({
    orderBy: [{ priority: "desc" }, { targetDate: { sort: "asc", nulls: "last" } }],
    include: {
      owner: { select: { id: true, name: true } },
      _count: { select: { bugs: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
      tasks: { select: { status: true } },
    },
  });
  return features.map(({ tasks, ...f }) => ({
    ...f,
    openBugs: f._count.bugs,
    taskCount: tasks.length,
    tasksDone: tasks.filter((t) => t.status === "COMPLETED").length,
  }));
}

export interface FeatureInput {
  title: string;
  description?: string;
  priority: Priority;
  status: FeatureStatus;
  ownerId?: string;
  targetDate?: Date;
}

export async function saveFeature(user: SessionUser, id: string | null, input: FeatureInput) {
  assertCan(user, "technology.write");
  const data = {
    title: input.title,
    description: input.description ?? null,
    priority: input.priority,
    status: input.status,
    ownerId: input.ownerId ?? null,
    targetDate: input.targetDate ?? null,
  };
  if (!id) {
    const feature = await db.feature.create({ data: { ...data, ownerId: data.ownerId ?? user.id, releasedAt: input.status === "RELEASED" ? new Date() : null } });
    await audit(user, { action: "feature.created", module: "technology", entityType: "Feature", entityId: feature.id, summary: `${user.name} added “${feature.title}” to the roadmap (${FEATURE_STATUS[feature.status].label})`, after: data, feed: true });
    return feature.id;
  }
  const existing = await db.feature.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Feature");
  const changes = diffFields(existing, data);
  await db.feature.update({ where: { id }, data: { ...data, releasedAt: input.status === "RELEASED" ? (existing.releasedAt ?? new Date()) : null } });
  if (changes) {
    await audit(user, {
      action: input.status === "RELEASED" && existing.status !== "RELEASED" ? "feature.released" : "feature.updated",
      module: "technology",
      entityType: "Feature",
      entityId: id,
      summary: input.status === "RELEASED" && existing.status !== "RELEASED" ? `${user.name} released “${input.title}”` : `${user.name} updated “${input.title}” (${Object.keys(changes.after).join(", ")})`,
      ...changes,
      feed: "status" in changes.after,
    });
  }
  return id;
}

export async function moveFeature(user: SessionUser, id: string, status: FeatureStatus) {
  assertCan(user, "technology.write");
  const existing = await db.feature.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Feature");
  if (existing.status === status) return;
  await db.feature.update({ where: { id }, data: { status, releasedAt: status === "RELEASED" ? new Date() : null } });
  await audit(user, {
    action: status === "RELEASED" ? "feature.released" : "feature.status_changed",
    module: "technology",
    entityType: "Feature",
    entityId: id,
    summary: status === "RELEASED" ? `${user.name} released “${existing.title}”` : `${user.name} moved “${existing.title}” to ${FEATURE_STATUS[status].label}`,
    before: { status: existing.status },
    after: { status },
    feed: true,
  });
}

export async function deleteFeature(user: SessionUser, id: string) {
  assertCan(user, "technology.write");
  const existing = await db.feature.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Feature");
  await db.feature.delete({ where: { id } });
  await audit(user, { action: "feature.deleted", module: "technology", entityType: "Feature", entityId: id, summary: `${user.name} removed “${existing.title}” from the roadmap`, before: { title: existing.title, status: existing.status } });
}

export async function featureOptions() {
  const features = await db.feature.findMany({ where: { status: { not: "RELEASED" } }, orderBy: { title: "asc" }, select: { id: true, title: true } });
  return features.map((f) => ({ value: f.id, label: f.title }));
}

// ─────────────────────────── Bugs ───────────────────────────

export type BugSort = "reportedAt" | "severity" | "number" | "status";

export async function listBugs(
  user: SessionUser,
  opts: { q?: string; severity?: BugSeverity; status?: BugStatus | "OPEN_ALL"; assigneeId?: string; mine?: boolean; sort: BugSort; dir: "asc" | "desc"; skip: number; take: number },
) {
  if (!canAny(user, ["technology.read", "technology.read.assigned", "technology.bugs.report"])) throw new ForbiddenError();
  const scope: Prisma.BugWhereInput = canAny(user, ["technology.read", "technology.read.assigned"]) ? bugsVisibleWhere(user) : { reporterId: user.id };
  const num = /^#?\d+$/.test(opts.q ?? "") ? Number((opts.q ?? "").replace("#", "")) : null;
  const where: Prisma.BugWhereInput = {
    AND: [
      scope,
      opts.mine ? { OR: [{ assigneeId: user.id }, { reporterId: user.id }] } : {},
      opts.severity ? { severity: opts.severity } : {},
      opts.status === "OPEN_ALL" ? { status: { in: ["OPEN", "IN_PROGRESS"] } } : opts.status ? { status: opts.status } : {},
      opts.assigneeId ? { assigneeId: opts.assigneeId } : {},
      opts.q ? { OR: [{ title: { contains: opts.q, mode: "insensitive" } }, ...(num ? [{ number: num }] : [])] } : {},
    ],
  };
  const orderBy: Prisma.BugOrderByWithRelationInput[] =
    opts.sort === "severity" ? [{ severity: opts.dir === "desc" ? "asc" : "desc" }, { reportedAt: "desc" }] : [{ [opts.sort]: opts.dir }];
  const [total, rows, bySeverity] = await Promise.all([
    db.bug.count({ where }),
    db.bug.findMany({
      where,
      orderBy,
      skip: opts.skip,
      take: opts.take,
      include: { reporter: { select: { name: true } }, assignee: { select: { id: true, name: true } }, feature: { select: { title: true } } },
    }),
    db.bug.groupBy({ by: ["severity"], where: { AND: [scope, { status: { in: ["OPEN", "IN_PROGRESS"] } }] }, _count: true }),
  ]);
  return {
    total,
    openBySeverity: Object.fromEntries(bySeverity.map((b) => [b.severity, b._count])) as Partial<Record<BugSeverity, number>>,
    rows: rows.map((b) => ({ ...b, canEdit: can(user, "technology.write"), canUpdateStatus: can(user, "technology.write") || b.assigneeId === user.id })),
  };
}

export interface BugInput {
  title: string;
  description?: string;
  severity: BugSeverity;
  environment?: string;
  assigneeId?: string;
  featureId?: string;
  status?: BugStatus;
}

export async function reportBug(user: SessionUser, input: BugInput) {
  assertCan(user, "technology.bugs.report");
  // Only people who triage bugs may assign them on creation.
  const assigneeId = can(user, "technology.write") ? (input.assigneeId ?? null) : null;
  const bug = await db.bug.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      severity: input.severity,
      environment: input.environment ?? null,
      reporterId: user.id,
      assigneeId,
      featureId: input.featureId ?? null,
    },
  });
  await audit(user, {
    action: "bug.reported",
    module: "technology",
    entityType: "Bug",
    entityId: bug.id,
    summary: `${user.name} reported ${BUG_SEVERITY[bug.severity].label.toLowerCase()} bug #${bug.number}: “${bug.title}”`,
    after: { severity: bug.severity, title: bug.title },
    feed: bug.severity === "CRITICAL" || bug.severity === "HIGH",
  });
  const triagers = bug.severity === "CRITICAL" || bug.severity === "HIGH" ? await usersWithPermission(["technology.write"]) : [];
  await notify({
    userIds: [...triagers.map((t) => t.id), assigneeId],
    excludeUserId: user.id,
    type: bug.severity === "CRITICAL" ? "ANNOUNCEMENT" : "TASK_ASSIGNED",
    title: `${BUG_SEVERITY[bug.severity].label} bug #${bug.number}: ${bug.title}`,
    body: `Reported by ${user.name}${input.environment ? ` · ${input.environment}` : ""}.`,
    link: `/technology/bugs?q=${bug.number}`,
  });
  return bug;
}

export async function updateBug(user: SessionUser, id: string, input: BugInput) {
  assertCan(user, "technology.write");
  const existing = await db.bug.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Bug");
  const status = input.status ?? existing.status;
  const data = {
    title: input.title,
    description: input.description ?? null,
    severity: input.severity,
    environment: input.environment ?? null,
    assigneeId: input.assigneeId ?? null,
    featureId: input.featureId ?? null,
    status,
  };
  const changes = diffFields(existing, data);
  if (!changes) return;
  await db.bug.update({
    where: { id },
    data: { ...data, resolvedAt: status === "RESOLVED" || status === "CLOSED" ? (existing.resolvedAt ?? new Date()) : null },
  });
  await audit(user, { action: "bug.updated", module: "technology", entityType: "Bug", entityId: id, summary: `${user.name} updated bug #${existing.number} (${Object.keys(changes.after).join(", ")})`, ...changes });
  if (input.assigneeId && input.assigneeId !== existing.assigneeId) {
    await notify({ userIds: [input.assigneeId], excludeUserId: user.id, type: "TASK_ASSIGNED", title: `Bug #${existing.number} assigned to you: ${input.title}`, link: `/technology/bugs?q=${existing.number}` });
  }
}

export async function setBugStatus(user: SessionUser, id: string, status: BugStatus) {
  const bug = await db.bug.findUnique({ where: { id } });
  if (!bug) throw new NotFoundError("Bug");
  if (!can(user, "technology.write") && bug.assigneeId !== user.id) throw new ForbiddenError("Only the assignee or a product manager can change this bug's status.");
  if (bug.status === status) return;
  await db.bug.update({ where: { id }, data: { status, resolvedAt: status === "RESOLVED" || status === "CLOSED" ? new Date() : null } });
  await audit(user, {
    action: "bug.status_changed",
    module: "technology",
    entityType: "Bug",
    entityId: id,
    summary: `${user.name} marked bug #${bug.number} as ${BUG_STATUS[status].label}`,
    before: { status: bug.status },
    after: { status },
    feed: (status === "RESOLVED" || status === "CLOSED") && (bug.severity === "CRITICAL" || bug.severity === "HIGH"),
  });
  if (bug.reporterId !== user.id && (status === "RESOLVED" || status === "CLOSED")) {
    await notify({ userIds: [bug.reporterId], type: "SYSTEM", title: `Bug #${bug.number} ${BUG_STATUS[status].label.toLowerCase()}: ${bug.title}`, body: `Updated by ${user.name}.`, link: `/technology/bugs?q=${bug.number}` });
  }
}

export async function deleteBug(user: SessionUser, id: string) {
  assertCan(user, "technology.write");
  const bug = await db.bug.findUnique({ where: { id } });
  if (!bug) throw new NotFoundError("Bug");
  await db.bug.delete({ where: { id } });
  await audit(user, { action: "bug.deleted", module: "technology", entityType: "Bug", entityId: id, summary: `${user.name} deleted bug #${bug.number} “${bug.title}”`, before: { title: bug.title, severity: bug.severity, status: bug.status } });
}

export async function openBugOptions(user: SessionUser) {
  const bugs = await db.bug.findMany({ where: { AND: [bugsVisibleWhere(user), { status: { in: ["OPEN", "IN_PROGRESS"] } }] }, orderBy: { number: "desc" }, select: { id: true, number: true, title: true } });
  return bugs.map((b) => ({ value: b.id, label: `#${b.number} ${b.title}` }));
}

// ─────────────────────────── Development tasks ───────────────────────────

/** Development tasks = tasks in the Technology department or linked to a feature / bug. */
export async function developmentTasksWhere(user: SessionUser): Promise<Prisma.TaskWhereInput> {
  const tech = await db.department.findUnique({ where: { slug: "technology" }, select: { id: true } });
  return {
    AND: [tasksVisibleWhere(user), { OR: [{ featureId: { not: null } }, { bugId: { not: null } }, ...(tech ? [{ departmentId: tech.id }] : [])] }],
  };
}

export async function technologyDepartmentId() {
  return (await db.department.findUnique({ where: { slug: "technology" }, select: { id: true } }))?.id ?? null;
}
