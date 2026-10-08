import "server-only";
import type { Prisma, Priority, TaskStatus } from "@prisma/client";
import { TASK_STATUS } from "@/lib/labels";
import { audit, diffFields } from "@/server/audit";
import { can, canAny, type SessionUser } from "@/server/auth/current-user";
import { db, type DbClient } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { notify } from "@/server/notify";
import { bugsVisibleWhere, meetingsVisibleWhere } from "./access";

// ─────────────────────────── Access rules ───────────────────────────

/**
 * Tasks a user may see: all (tasks.read.all), their department's
 * (tasks.read.department), and always those assigned to or created by them.
 */
export function tasksVisibleWhere(user: SessionUser): Prisma.TaskWhereInput {
  if (can(user, "tasks.read.all")) return {};
  const or: Prisma.TaskWhereInput[] = [{ assigneeId: user.id }, { creatorId: user.id }];
  if (can(user, "tasks.read.department") && user.departmentId) or.push({ departmentId: user.departmentId });
  return { OR: or };
}

type TaskAccessShape = { creatorId: string; assigneeId: string | null; departmentId: string | null };

/** Full edit: creator, directors (tasks.read.all), or department leads who assign work. */
function canManageTask(user: SessionUser, task: TaskAccessShape): boolean {
  if (task.creatorId === user.id || can(user, "tasks.read.all")) return true;
  return can(user, "tasks.assign") && can(user, "tasks.read.department") && !!user.departmentId && task.departmentId === user.departmentId;
}

/** Status-only updates are also open to the assignee. */
function canUpdateStatus(user: SessionUser, task: TaskAccessShape): boolean {
  return task.assigneeId === user.id || canManageTask(user, task);
}

// ─────────────────────────── Queries ───────────────────────────

export type TaskScope = "mine" | "created" | "department" | "all";
export type TaskSort = "dueDate" | "priority" | "createdAt" | "number" | "status";

export async function listTasks(
  user: SessionUser,
  opts: {
    scope: TaskScope;
    q?: string;
    status?: TaskStatus | "OPEN";
    priority?: Priority;
    assigneeId?: string;
    departmentId?: string;
    projectId?: string;
    overdue?: boolean;
    /** Additional filter (e.g. development tasks only). */
    where?: Prisma.TaskWhereInput;
    sort: TaskSort;
    dir: "asc" | "desc";
    skip: number;
    take: number;
  },
) {
  const scopeWhere: Prisma.TaskWhereInput =
    opts.scope === "mine"
      ? { assigneeId: user.id }
      : opts.scope === "created"
        ? { creatorId: user.id }
        : opts.scope === "department"
          ? { departmentId: user.departmentId ?? "__none__" }
          : {};
  const numberQuery = /^#?\d+$/.test(opts.q ?? "") ? Number((opts.q ?? "").replace("#", "")) : null;
  const where: Prisma.TaskWhereInput = {
    AND: [
      tasksVisibleWhere(user),
      scopeWhere,
      opts.where ?? {},
      opts.status === "OPEN" ? { status: { not: "COMPLETED" } } : opts.status ? { status: opts.status } : {},
      opts.priority ? { priority: opts.priority } : {},
      opts.assigneeId ? { assigneeId: opts.assigneeId } : {},
      opts.departmentId ? { departmentId: opts.departmentId } : {},
      opts.projectId ? { projectId: opts.projectId } : {},
      opts.overdue ? { status: { not: "COMPLETED" }, dueDate: { lt: new Date() } } : {},
      opts.q
        ? {
            OR: [
              { title: { contains: opts.q, mode: "insensitive" } },
              { description: { contains: opts.q, mode: "insensitive" } },
              ...(numberQuery ? [{ number: numberQuery }] : []),
            ],
          }
        : {},
    ],
  };

  // Priority sorts by severity, not alphabetically.
  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    opts.sort === "priority"
      ? [{ priority: opts.dir }, { dueDate: { sort: "asc", nulls: "last" } }]
      : opts.sort === "dueDate"
        ? [{ dueDate: { sort: opts.dir, nulls: "last" } }, { priority: "desc" }]
        : [{ [opts.sort]: opts.dir }];

  const [total, rows, counts] = await Promise.all([
    db.task.count({ where }),
    db.task.findMany({
      where,
      orderBy,
      skip: opts.skip,
      take: opts.take,
      include: {
        assignee: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
        feature: { select: { id: true, title: true } },
        bug: { select: { id: true, number: true } },
        _count: { select: { attachments: true } },
      },
    }),
    db.task.groupBy({ by: ["status"], where: { AND: [tasksVisibleWhere(user), scopeWhere, opts.where ?? {}] }, _count: true }),
  ]);

  return {
    total,
    rows: rows.map((t) => ({ ...t, canManage: canManageTask(user, t), canUpdateStatus: canUpdateStatus(user, t) })),
    statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<TaskStatus, number>>,
  };
}

export async function getTask(user: SessionUser, id: string) {
  const task = await db.task.findFirst({
    where: { AND: [{ id }, tasksVisibleWhere(user)] },
    include: {
      assignee: { select: { id: true, name: true, jobTitle: true } },
      creator: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      meeting: { select: { id: true, title: true, startsAt: true } },
      feature: { select: { id: true, title: true } },
      bug: { select: { id: true, number: true, title: true } },
      school: { select: { id: true, name: true } },
      attachments: { include: { document: { select: { id: true, title: true, category: true, currentVersion: true } } } },
    },
  });
  if (!task) throw new NotFoundError("Task");
  return { ...task, canManage: canManageTask(user, task), canUpdateStatus: canUpdateStatus(user, task) };
}

export async function myOpenTasks(user: SessionUser, take = 6) {
  return db.task.findMany({
    where: { assigneeId: user.id, status: { not: "COMPLETED" } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
    take,
    select: { id: true, number: true, title: true, status: true, priority: true, dueDate: true },
  });
}

export async function overdueTasks(user: SessionUser, take = 6) {
  const where: Prisma.TaskWhereInput = {
    AND: [tasksVisibleWhere(user), { status: { not: "COMPLETED" }, dueDate: { lt: new Date() } }],
  };
  const [total, rows] = await Promise.all([
    db.task.count({ where }),
    db.task.findMany({
      where,
      orderBy: { dueDate: "asc" },
      take,
      select: { id: true, number: true, title: true, priority: true, dueDate: true, assignee: { select: { name: true } } },
    }),
  ]);
  return { total, rows };
}

// ─────────────────────────── Mutations ───────────────────────────

export interface TaskInput {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: Date;
  assigneeId?: string;
  departmentId?: string;
  projectId?: string;
  meetingId?: string;
  featureId?: string;
  bugId?: string;
  schoolId?: string;
}

async function validateAssignee(user: SessionUser, assigneeId: string | undefined, preAuthorised = false) {
  if (!assigneeId || assigneeId === user.id) return null;
  if (!preAuthorised && !can(user, "tasks.assign")) throw new ForbiddenError("You can only create tasks for yourself.");
  const assignee = await db.user.findFirst({ where: { id: assigneeId, status: "ACTIVE" }, select: { id: true, departmentId: true } });
  if (!assignee) throw new ValidationError("The selected assignee is not an active user.", { assigneeId: ["Choose an active team member."] });
  return assignee;
}

/** Linked records must be ones the user can see, so tasks can't be attached to hidden meetings, schools or bugs. */
async function validateLinks(user: SessionUser, input: Pick<TaskInput, "meetingId" | "schoolId" | "featureId" | "bugId">) {
  const invalid = (field: string, label: string) => new ValidationError(`You don't have access to that ${label}.`, { [field]: [`Choose a ${label} you can access.`] });
  const [meeting, bug] = await Promise.all([
    input.meetingId ? db.meeting.count({ where: { AND: [{ id: input.meetingId }, meetingsVisibleWhere(user)] } }) : 1,
    input.bugId ? db.bug.count({ where: { AND: [{ id: input.bugId }, bugsVisibleWhere(user)] } }) : 1,
  ]);
  if (!meeting) throw invalid("meetingId", "meeting");
  if (!bug) throw invalid("bugId", "bug");
  if (input.schoolId && !can(user, "schools.read")) throw invalid("schoolId", "school");
  if (input.featureId && !canAny(user, ["technology.read", "technology.read.assigned"])) throw invalid("featureId", "feature");
}

/**
 * `assigneePreAuthorised` is for callers that have already checked the user may
 * assign this person (e.g. a meeting organiser assigning an action item to an
 * attendee), so it bypasses the general tasks.assign permission.
 */
export async function createTask(user: SessionUser, input: TaskInput, client: DbClient = db, opts: { assigneePreAuthorised?: boolean } = {}) {
  const assignee = await validateAssignee(user, input.assigneeId, opts.assigneePreAuthorised);
  await validateLinks(user, input);
  const assigneeId = input.assigneeId ?? user.id;
  const departmentId = input.departmentId ?? assignee?.departmentId ?? user.departmentId ?? null;

  const task = await client.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
      completedAt: input.status === "COMPLETED" ? new Date() : null,
      assigneeId,
      creatorId: user.id,
      departmentId,
      projectId: input.projectId ?? null,
      meetingId: input.meetingId ?? null,
      featureId: input.featureId ?? null,
      bugId: input.bugId ?? null,
      schoolId: input.schoolId ?? null,
    },
  });
  await audit(
    user,
    {
      action: "task.created",
      module: "tasks",
      entityType: "Task",
      entityId: task.id,
      summary: `${user.name} created task #${task.number} “${task.title}”`,
      after: { title: task.title, assigneeId, priority: task.priority, dueDate: task.dueDate },
    },
    client,
  );
  if (assigneeId !== user.id) {
    await notify(
      {
        userIds: [assigneeId],
        type: "TASK_ASSIGNED",
        title: `New task: ${task.title}`,
        body: `${user.name} assigned you task #${task.number}${task.meetingId ? " (meeting action item)" : ""}.`,
        link: `/tasks/${task.id}`,
      },
      client,
    );
  }
  return task;
}

export async function updateTask(user: SessionUser, id: string, input: TaskInput) {
  const task = await db.task.findUnique({ where: { id } });
  if (!task) throw new NotFoundError("Task");
  if (!canManageTask(user, task)) throw new ForbiddenError("Only the task's creator or a manager can edit it.");
  if (input.assigneeId !== task.assigneeId) await validateAssignee(user, input.assigneeId);

  const data = {
    title: input.title,
    description: input.description ?? null,
    status: input.status,
    priority: input.priority,
    dueDate: input.dueDate ?? null,
    assigneeId: input.assigneeId ?? null,
    departmentId: input.departmentId ?? null,
    projectId: input.projectId ?? null,
  };
  const changes = diffFields(task, data);
  if (!changes) return task;

  const updated = await db.task.update({
    where: { id },
    data: {
      ...data,
      completedAt: input.status === "COMPLETED" ? (task.completedAt ?? new Date()) : null,
    },
  });
  const completedNow = task.status !== "COMPLETED" && input.status === "COMPLETED";
  await audit(user, {
    action: completedNow ? "task.completed" : "task.updated",
    module: "tasks",
    entityType: "Task",
    entityId: id,
    summary: completedNow
      ? `${user.name} completed task #${task.number} “${updated.title}”`
      : `${user.name} updated task #${task.number} (${Object.keys(changes.after).join(", ")})`,
    ...changes,
    feed: completedNow,
  });
  if (input.assigneeId && input.assigneeId !== task.assigneeId && input.assigneeId !== user.id) {
    await notify({
      userIds: [input.assigneeId],
      type: "TASK_ASSIGNED",
      title: `Task reassigned to you: ${updated.title}`,
      body: `${user.name} assigned you task #${updated.number}.`,
      link: `/tasks/${id}`,
    });
  }
  return updated;
}

export async function setTaskStatus(user: SessionUser, id: string, status: TaskStatus) {
  const task = await db.task.findUnique({ where: { id } });
  if (!task) throw new NotFoundError("Task");
  if (!canUpdateStatus(user, task)) throw new ForbiddenError();
  if (task.status === status) return task;
  const updated = await db.task.update({
    where: { id },
    data: { status, completedAt: status === "COMPLETED" ? new Date() : null },
  });
  const completedNow = status === "COMPLETED";
  await audit(user, {
    action: completedNow ? "task.completed" : "task.status_changed",
    module: "tasks",
    entityType: "Task",
    entityId: id,
    summary: completedNow
      ? `${user.name} completed task #${task.number} “${task.title}”`
      : `${user.name} moved task #${task.number} to ${TASK_STATUS[status].label}`,
    before: { status: task.status },
    after: { status },
    feed: completedNow,
  });
  if (task.creatorId !== user.id && (completedNow || status === "BLOCKED")) {
    await notify({
      userIds: [task.creatorId],
      type: "SYSTEM",
      title: `Task #${task.number} ${completedNow ? "completed" : "is blocked"}: ${task.title}`,
      body: `Updated by ${user.name}.`,
      link: `/tasks/${id}`,
    });
  }
  return updated;
}

export async function deleteTask(user: SessionUser, id: string) {
  const task = await db.task.findUnique({ where: { id } });
  if (!task) throw new NotFoundError("Task");
  if (task.creatorId !== user.id && !can(user, "tasks.read.all")) throw new ForbiddenError("Only the creator or a director can delete a task.");
  await db.task.delete({ where: { id } });
  await audit(user, {
    action: "task.deleted",
    module: "tasks",
    entityType: "Task",
    entityId: id,
    summary: `${user.name} deleted task #${task.number} “${task.title}”`,
    before: { title: task.title, status: task.status, assigneeId: task.assigneeId },
  });
}

export async function setTaskAttachments(user: SessionUser, taskId: string, documentIds: string[], visibleDocumentIds: Set<string>) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) throw new NotFoundError("Task");
  if (!canUpdateStatus(user, task)) throw new ForbiddenError();
  const allowed = documentIds.filter((id) => visibleDocumentIds.has(id));
  await db.$transaction([
    db.taskAttachment.deleteMany({ where: { taskId } }),
    db.taskAttachment.createMany({ data: allowed.map((documentId) => ({ taskId, documentId })), skipDuplicates: true }),
  ]);
  await audit(user, {
    action: "task.attachments_updated",
    module: "tasks",
    entityType: "Task",
    entityId: taskId,
    summary: `${user.name} updated attachments on task #${task.number} (${allowed.length} document${allowed.length === 1 ? "" : "s"})`,
    after: { documentIds: allowed },
  });
}

// ─────────────────────────── Projects ───────────────────────────

export async function listProjects(user: SessionUser) {
  const projects = await db.project.findMany({
    orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }],
    include: {
      owner: { select: { name: true } },
      department: { select: { name: true } },
      tasks: { where: tasksVisibleWhere(user), select: { status: true } },
    },
  });
  return projects.map(({ tasks, ...p }) => ({
    ...p,
    taskCount: tasks.length,
    completed: tasks.filter((t) => t.status === "COMPLETED").length,
  }));
}

export async function projectOptions() {
  const projects = await db.project.findMany({
    where: { status: { in: ["PLANNING", "ACTIVE", "ON_HOLD"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return projects.map((p) => ({ value: p.id, label: p.name }));
}

export async function createProject(
  user: SessionUser,
  input: { name: string; description?: string; status: Prisma.ProjectCreateInput["status"]; ownerId?: string; departmentId?: string; startDate?: Date; dueDate?: Date },
) {
  if (!can(user, "tasks.assign")) throw new ForbiddenError();
  const project = await db.project.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      status: input.status,
      ownerId: input.ownerId ?? user.id,
      departmentId: input.departmentId ?? user.departmentId,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
    },
  });
  await audit(user, {
    action: "project.created",
    module: "tasks",
    entityType: "Project",
    entityId: project.id,
    summary: `${user.name} created project “${project.name}”`,
    after: { name: project.name, status: project.status },
  });
  return project;
}
