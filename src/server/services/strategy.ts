import "server-only";
import type { Objective, ObjectiveMetric, ObjectiveStatus, Prisma } from "@prisma/client";
import { addDays, dbDate, quarterOf, sastYear } from "@/lib/dates";
import { OBJECTIVE_STATUS } from "@/lib/labels";
import { clamp } from "@/lib/utils";
import { audit, diffFields } from "@/server/audit";
import { assertCan, can, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { learnerPlatform } from "@/server/integrations/learner-platform";
import { notify } from "@/server/notify";
import { departmentOptions } from "@/server/rbac";
import { cashBalanceAt, mrrAt } from "./metrics";

// ─────────────────────────── Live metrics & progress ───────────────────────────

/**
 * Resolves live values for metric-linked objectives (one query per metric type used).
 * A source that fails is logged and left out, so its objectives fall back to the
 * last captured value instead of breaking the page.
 */
async function liveMetricValues(metrics: Set<ObjectiveMetric>): Promise<Partial<Record<ObjectiveMetric, number>>> {
  const now = new Date();
  const values: Partial<Record<ObjectiveMetric, number>> = {};
  const jobs: Promise<void>[] = [];
  const track = (name: string, job: Promise<void>) =>
    jobs.push(job.catch((error: unknown) => console.error(`[strategy] live metric ${name} unavailable`, error)));
  if (metrics.has("PAYING_LEARNERS") || metrics.has("ACTIVE_LEARNERS")) {
    track(
      "learners",
      learnerPlatform.snapshotAt(now).then((s) => {
        values.PAYING_LEARNERS = s.payingLearners;
        values.ACTIVE_LEARNERS = s.activeLearners;
      }),
    );
  }
  if (metrics.has("MRR")) track("MRR", mrrAt(now).then((m) => void (values.MRR = Math.round(m.total))));
  if (metrics.has("ACTIVE_SCHOOLS")) track("ACTIVE_SCHOOLS", db.partnership.count({ where: { status: "ACTIVE" } }).then((n) => void (values.ACTIVE_SCHOOLS = n)));
  if (metrics.has("CASH_BALANCE")) track("CASH_BALANCE", cashBalanceAt(now).then((c) => void (values.CASH_BALANCE = Math.round(c))));
  if (metrics.has("PUBLISHED_CONTENT")) {
    track("PUBLISHED_CONTENT", db.contentItem.count({ where: { stage: "PUBLISHED" } }).then((n) => void (values.PUBLISHED_CONTENT = n)));
  }
  await Promise.all(jobs);
  return values;
}

export function objectiveProgress(start: number, target: number, current: number): number {
  if (target === start) return current >= target ? 100 : 0;
  return clamp(((current - start) / (target - start)) * 100, 0, 100);
}

/** Attention order: delayed first, then at risk, overdue, on track; completed last. */
const STATUS_RANK: Record<ObjectiveStatus, number> = { DELAYED: 0, AT_RISK: 1, ON_TRACK: 2, COMPLETED: 3 };

type ProgressFields = Pick<Objective, "metric" | "startValue" | "targetValue" | "currentValue" | "status" | "deadline">;

type WithProgress<T extends ProgressFields> = Omit<T, "startValue" | "targetValue" | "currentValue"> & {
  startValue: number;
  targetValue: number;
  /** The live metric value when available, otherwise the last recorded value. */
  currentValue: number;
  /** True when `currentValue` was just computed from the linked metric. */
  isLive: boolean;
  progress: number;
  /** Past its deadline (SAST calendar day) without being completed. */
  overdue: boolean;
  /** At risk, delayed or overdue. */
  needsAttention: boolean;
};

type LiveValues = Partial<Record<ObjectiveMetric, number>>;

function metricsOf(rows: { metric: ObjectiveMetric }[]) {
  return new Set(rows.map((r) => r.metric).filter((m) => m !== "MANUAL"));
}

function decorate<T extends ProgressFields>(o: T, live: LiveValues, today: Date): WithProgress<T> {
  const liveValue = o.metric === "MANUAL" ? undefined : live[o.metric];
  const startValue = Number(o.startValue);
  const targetValue = Number(o.targetValue);
  const currentValue = liveValue ?? Number(o.currentValue);
  const overdue = o.status !== "COMPLETED" && o.deadline < today;
  return {
    ...o,
    startValue,
    targetValue,
    currentValue,
    isLive: liveValue !== undefined,
    progress: objectiveProgress(startValue, targetValue, currentValue),
    overdue,
    needsAttention: overdue || o.status === "AT_RISK" || o.status === "DELAYED",
  };
}

async function withProgress<T extends ProgressFields>(rows: T[]): Promise<WithProgress<T>[]> {
  const live = await liveMetricValues(metricsOf(rows));
  const today = dbDate(new Date());
  return rows.map((o) => decorate(o, live, today));
}

function attentionRank(o: { status: ObjectiveStatus; overdue: boolean }) {
  return STATUS_RANK[o.status] - (o.overdue ? 0.5 : 0);
}

function byAttention(a: ObjectiveWithProgress, b: ObjectiveWithProgress) {
  return attentionRank(a) - attentionRank(b) || a.deadline.getTime() - b.deadline.getTime() || a.title.localeCompare(b.title);
}

// ─────────────────────────── Queries ───────────────────────────

const listInclude = {
  owner: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  updates: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
} satisfies Prisma.ObjectiveInclude;

export async function listObjectives(user: SessionUser, opts: { year?: number; quarter?: number | null } = {}) {
  assertCan(user, "strategy.read");
  const year = opts.year ?? sastYear(new Date());
  const rows = await db.objective.findMany({
    where: { year, ...(opts.quarter !== undefined ? { quarter: opts.quarter } : {}) },
    orderBy: [{ quarter: { sort: "asc", nulls: "first" } }, { deadline: "asc" }],
    include: listInclude,
  });
  const decorated = await withProgress(rows);
  return decorated.map(({ updates, ...o }) => ({ ...o, lastUpdateAt: updates[0]?.createdAt ?? null }));
}

export type ObjectiveWithProgress = Awaited<ReturnType<typeof listObjectives>>[number];

export async function companyObjectivesSummary(user: SessionUser) {
  if (!can(user, "strategy.read")) return null;
  const now = new Date();
  const year = sastYear(now);
  const objectives = await listObjectives(user, { year });
  const annual = objectives.filter((o) => o.quarter === null);
  const quarterly = objectives.filter((o) => o.quarter === quarterOf(now));
  const overall = objectives.length ? objectives.reduce((s, o) => s + o.progress, 0) / objectives.length : 0;
  const byStatus = Object.fromEntries(
    (Object.keys(OBJECTIVE_STATUS) as ObjectiveStatus[]).map((s) => [s, objectives.filter((o) => o.status === s).length]),
  ) as Record<ObjectiveStatus, number>;
  return { year, quarter: quarterOf(now), annual, quarterly, overall, byStatus, total: objectives.length };
}

/** Years that have objectives, plus the current and next year so planning can start. */
async function objectiveYears(): Promise<{ year: number; count: number }[]> {
  const current = sastYear(new Date());
  const rows = await db.objective.groupBy({ by: ["year"], _count: { _all: true } });
  const counts = new Map<number, number>([
    [current, 0],
    [current + 1, 0],
  ]);
  for (const r of rows) counts.set(r.year, r._count._all);
  return [...counts.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year);
}

export type ObjectivePeriodFilter = "all" | "annual" | 1 | 2 | 3 | 4;
/** A single status, or "ATTENTION" for at risk, delayed and overdue objectives. */
export type ObjectiveStatusFilter = ObjectiveStatus | "ATTENTION";

export interface StrategyGroup {
  objective: ObjectiveWithProgress;
  /** False when the annual objective is only shown as context for matching quarterly objectives. */
  matches: boolean;
  children: ObjectiveWithProgress[];
  /** All quarterly objectives that roll up to it, regardless of filters. */
  childCount: number;
}

/**
 * The strategy page: annual objectives with their quarterly objectives, filtered by
 * period and status and ordered so delayed / at-risk work surfaces first. Summary
 * figures cover the selected year and period (not the status filter).
 */
export async function strategyOverview(user: SessionUser, opts: { year: number; period: ObjectivePeriodFilter; status?: ObjectiveStatusFilter }) {
  assertCan(user, "strategy.read");
  const [objectives, years] = await Promise.all([listObjectives(user, { year: opts.year }), objectiveYears()]);

  const inPeriod = (o: ObjectiveWithProgress) => opts.period === "all" || (opts.period === "annual" ? o.quarter === null : o.quarter === opts.period);
  const matchesStatus = (o: ObjectiveWithProgress) => !opts.status || (opts.status === "ATTENTION" ? o.needsAttention : o.status === opts.status);
  const visible = (o: ObjectiveWithProgress) => inPeriod(o) && matchesStatus(o);

  const annual = objectives.filter((o) => o.quarter === null);
  const annualIds = new Set(annual.map((o) => o.id));
  const quarterly = objectives.filter((o) => o.quarter !== null);

  const groups: StrategyGroup[] = annual
    .map((objective) => {
      const all = quarterly.filter((q) => q.parentId === objective.id);
      return { objective, matches: visible(objective), children: all.filter(visible).sort(byAttention), childCount: all.length };
    })
    .filter((g) => g.matches || g.children.length > 0);
  const groupRank = (g: StrategyGroup) => Math.min(g.matches ? attentionRank(g.objective) : Infinity, ...g.children.map(attentionRank));
  groups.sort((a, b) => groupRank(a) - groupRank(b) || byAttention(a.objective, b.objective));

  // Quarterly objectives whose annual objective was deleted or never set.
  const unlinked = quarterly.filter((q) => !q.parentId || !annualIds.has(q.parentId)).filter(visible).sort(byAttention);

  const scoped = objectives.filter(inPeriod);
  const average = (list: ObjectiveWithProgress[]) => (list.length ? list.reduce((s, o) => s + o.progress, 0) / list.length : null);
  const today = dbDate(new Date());
  const soon = addDays(today, 30);
  const stats = {
    total: scoped.length,
    annual: scoped.filter((o) => o.quarter === null).length,
    quarterly: scoped.filter((o) => o.quarter !== null).length,
    byStatus: Object.fromEntries((Object.keys(OBJECTIVE_STATUS) as ObjectiveStatus[]).map((s) => [s, scoped.filter((o) => o.status === s).length])) as Record<ObjectiveStatus, number>,
    averageProgress: average(scoped),
    annualProgress: average(scoped.filter((o) => o.quarter === null)),
    quarterlyProgress: average(scoped.filter((o) => o.quarter !== null)),
    attention: scoped.filter((o) => o.needsAttention).length,
    overdue: scoped.filter((o) => o.overdue).length,
    dueSoon: scoped.filter((o) => o.status !== "COMPLETED" && !o.overdue && o.deadline <= soon).length,
  };

  return { year: opts.year, years, groups, unlinked, stats, total: objectives.length };
}

/** Recording progress: strategy editors, or the objective's owner. */
function canRecordProgress(user: SessionUser, objective: { ownerId: string }) {
  return can(user, "strategy.write") || objective.ownerId === user.id;
}

export async function getObjective(user: SessionUser, id: string) {
  assertCan(user, "strategy.read");
  const row = await db.objective.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, jobTitle: true } },
      department: { select: { id: true, name: true } },
      updates: { orderBy: { createdAt: "desc" }, include: { author: { select: { id: true, name: true } } } },
      children: { include: listInclude },
      parent: { include: listInclude },
    },
  });
  if (!row) throw new NotFoundError("Objective");
  const { updates, children, parent, ...objective } = row;
  // One live-metric resolution for the objective, its quarterly objectives and its parent.
  const live = await liveMetricValues(metricsOf([objective, ...children, ...(parent ? [parent] : [])]));
  const today = dbDate(new Date());
  const listItem = <R extends ProgressFields & { updates: { createdAt: Date }[] }>(r: R) => {
    const { updates: latest, ...rest } = decorate(r, live, today);
    return { ...rest, lastUpdateAt: latest[0]?.createdAt ?? null };
  };
  return {
    ...decorate(objective, live, today),
    lastUpdateAt: updates[0]?.createdAt ?? null,
    updates: updates.map((u) => ({ ...u, value: Number(u.value) })),
    children: children.map(listItem).sort((a, b) => (a.quarter ?? 0) - (b.quarter ?? 0) || byAttention(a, b)),
    parent: parent ? listItem(parent) : null,
    canEdit: can(user, "strategy.write"),
    canRecord: canRecordProgress(user, objective),
  };
}

/** Objective owners must be active and able to see the Strategy module. */
const ownerWhere = {
  status: "ACTIVE",
  role: { permissions: { some: { permission: { key: "strategy.read" } } } },
} satisfies Prisma.UserWhereInput;

/** Owner, department and parent pickers for the objective form (parents from the year before and after too). */
export async function objectiveFormOptions(user: SessionUser, year: number) {
  assertCan(user, "strategy.write");
  const [owners, departments, parents] = await Promise.all([
    db.user.findMany({ where: ownerWhere, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    departmentOptions(),
    db.objective.findMany({
      where: { quarter: null, year: { in: [year - 1, year, year + 1] } },
      orderBy: { title: "asc" },
      select: { id: true, title: true, year: true },
    }),
  ]);
  return {
    owners: owners.map((u) => ({ value: u.id, label: u.name })),
    departments,
    // The selected year's objectives first; others are labelled with their year.
    parents: parents
      .sort((a, b) => Number(b.year === year) - Number(a.year === year) || a.year - b.year)
      .map((o) => ({ value: o.id, label: o.year === year ? o.title : `${o.title} (${o.year})` })),
  };
}

// ─────────────────────────── Mutations ───────────────────────────

export interface ObjectiveInput {
  title: string;
  description?: string;
  ownerId: string;
  departmentId?: string;
  parentId?: string;
  year: number;
  quarter?: number;
  metric: ObjectiveMetric;
  unit?: string;
  startValue: number;
  targetValue: number;
  currentValue?: number;
  deadline: Date;
  status: ObjectiveStatus;
}

/**
 * Enforces the objective hierarchy: annual objectives stand alone; quarterly
 * objectives roll up to an annual objective of the same year. Returns the
 * parent id to store (annual objectives never keep one).
 */
async function validateObjective(input: ObjectiveInput, existing?: Objective & { _count: { children: number } }) {
  if (input.targetValue === input.startValue) {
    throw new ValidationError("Target must differ from the starting value.", { targetValue: ["Must differ from the start value."] });
  }
  if (input.deadline.getUTCFullYear() !== input.year) {
    throw new ValidationError(`The deadline must fall within ${input.year}.`, { deadline: [`Choose a date in ${input.year}.`] });
  }
  if (input.quarter !== undefined && (input.quarter < 1 || input.quarter > 4)) {
    throw new ValidationError("Choose a quarter from Q1 to Q4.", { quarter: ["Choose a quarter from Q1 to Q4."] });
  }

  const [owner, department] = await Promise.all([
    db.user.findFirst({ where: { id: input.ownerId, ...ownerWhere }, select: { id: true } }),
    input.departmentId ? db.department.findUnique({ where: { id: input.departmentId }, select: { id: true } }) : null,
  ]);
  if (!owner) throw new ValidationError("Choose an active team member with access to Strategy.", { ownerId: ["Choose an owner who can view company objectives."] });
  if (input.departmentId && !department) throw new ValidationError("That department no longer exists.", { departmentId: ["Choose a department."] });

  const children = existing?._count.children ?? 0;
  if (existing && children > 0) {
    const plural = children === 1 ? "objective rolls" : "objectives roll";
    if (input.quarter !== undefined) {
      throw new ValidationError(`${children} quarterly ${plural} up to this objective, so it must stay annual.`, {
        quarter: ["Re-link or delete its quarterly objectives first."],
      });
    }
    if (input.year !== existing.year) {
      throw new ValidationError(`${children} quarterly ${plural} up to this objective in ${existing.year}, so its year can't change.`, {
        year: [`Keep ${existing.year}, or move its quarterly objectives first.`],
      });
    }
  }

  if (input.quarter === undefined) return null;
  if (!input.parentId) {
    throw new ValidationError("Quarterly objectives must roll up to an annual objective.", { parentId: ["Choose the annual objective this supports."] });
  }
  const parent = await db.objective.findUnique({ where: { id: input.parentId }, select: { id: true, year: true, quarter: true } });
  if (!parent || parent.id === existing?.id || parent.quarter !== null) {
    throw new ValidationError("Choose an annual objective as the parent.", { parentId: ["Choose an annual objective."] });
  }
  if (parent.year !== input.year) {
    throw new ValidationError(`The annual objective is for ${parent.year}, but this objective is for ${input.year}.`, {
      parentId: [`Choose a ${input.year} annual objective, or change the year.`],
    });
  }
  return parent.id;
}

function periodLabel(o: { year: number; quarter: number | null }) {
  return o.quarter ? `Q${o.quarter} ${o.year}` : `${o.year}`;
}

export async function createObjective(user: SessionUser, input: ObjectiveInput) {
  assertCan(user, "strategy.write");
  const parentId = await validateObjective(input);
  return db.$transaction(async (tx) => {
    const objective = await tx.objective.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        ownerId: input.ownerId,
        departmentId: input.departmentId ?? null,
        parentId,
        year: input.year,
        quarter: input.quarter ?? null,
        metric: input.metric,
        unit: input.unit ?? "",
        startValue: input.startValue,
        targetValue: input.targetValue,
        // Metric-linked objectives are computed live; the stored value is only a fallback snapshot.
        currentValue: input.metric === "MANUAL" ? (input.currentValue ?? input.startValue) : input.startValue,
        deadline: input.deadline,
        status: input.status,
      },
    });
    await audit(
      user,
      {
        action: "objective.created",
        module: "strategy",
        entityType: "Objective",
        entityId: objective.id,
        summary: `${user.name} created ${objective.quarter ? `Q${objective.quarter} ` : ""}objective “${objective.title}” (target ${input.targetValue}${input.unit ? ` ${input.unit}` : ""})`,
        after: { title: objective.title, year: objective.year, quarter: objective.quarter, metric: objective.metric, targetValue: input.targetValue, deadline: objective.deadline, ownerId: objective.ownerId, parentId },
        feed: true,
      },
      tx,
    );
    await notify(
      {
        userIds: [objective.ownerId],
        type: "SYSTEM",
        title: `You own a ${periodLabel(objective)} objective: ${objective.title}`,
        body: `${user.name} made you responsible for this company objective. Record progress check-ins from the objective page.`,
        link: `/strategy/${objective.id}`,
        excludeUserId: user.id,
      },
      tx,
    );
    return objective;
  });
}

export async function updateObjective(user: SessionUser, id: string, input: ObjectiveInput) {
  assertCan(user, "strategy.write");
  const existing = await db.objective.findUnique({ where: { id }, include: { _count: { select: { children: true } } } });
  if (!existing) throw new NotFoundError("Objective");
  const parentId = await validateObjective(input, existing);

  // Switching from a live metric to manual updates keeps the latest live value as the starting point.
  let currentValue: number | undefined;
  if (existing.metric !== "MANUAL" && input.metric === "MANUAL") {
    const live = await liveMetricValues(new Set([existing.metric]));
    currentValue = live[existing.metric];
  }

  const data = {
    title: input.title,
    description: input.description ?? null,
    ownerId: input.ownerId,
    departmentId: input.departmentId ?? null,
    parentId,
    year: input.year,
    quarter: input.quarter ?? null,
    metric: input.metric,
    unit: input.unit ?? "",
    startValue: input.startValue,
    targetValue: input.targetValue,
    deadline: input.deadline,
    status: input.status,
    ...(currentValue !== undefined ? { currentValue } : {}),
  };
  const changes = diffFields(existing, data);
  if (!changes) return;
  await db.$transaction(async (tx) => {
    await tx.objective.update({ where: { id }, data });
    await audit(
      user,
      {
        action: "objective.updated",
        module: "strategy",
        entityType: "Objective",
        entityId: id,
        summary: `${user.name} updated objective “${input.title}”`,
        ...changes,
      },
      tx,
    );
    if (existing.ownerId !== input.ownerId) {
      await notify(
        {
          userIds: [input.ownerId],
          type: "SYSTEM",
          title: `You now own a ${periodLabel(data)} objective: ${input.title}`,
          body: `${user.name} made you responsible for this company objective.`,
          link: `/strategy/${id}`,
          excludeUserId: user.id,
        },
        tx,
      );
    }
  });
}

/**
 * Records a progress check-in (value + status + note) and updates the objective.
 * Metric-linked objectives capture the live value at the time of the check-in.
 */
export async function recordObjectiveUpdate(user: SessionUser, input: { id: string; value?: number; status: ObjectiveStatus; note?: string }) {
  assertCan(user, "strategy.read");
  const objective = await db.objective.findUnique({ where: { id: input.id } });
  if (!objective) throw new NotFoundError("Objective");
  if (!canRecordProgress(user, objective)) throw new ForbiddenError("Only the objective's owner or a strategy editor can record progress.");
  const value =
    objective.metric === "MANUAL"
      ? (input.value ?? Number(objective.currentValue))
      : ((await liveMetricValues(new Set([objective.metric])))[objective.metric] ?? Number(objective.currentValue));
  const unit = objective.unit ? ` ${objective.unit}` : "";

  await db.$transaction(async (tx) => {
    await tx.objective.update({ where: { id: input.id }, data: { status: input.status, currentValue: value } });
    await tx.objectiveUpdate.create({ data: { objectiveId: input.id, value, status: input.status, note: input.note ?? null, authorId: user.id } });
    await audit(
      user,
      {
        action: "objective.progress",
        module: "strategy",
        entityType: "Objective",
        entityId: input.id,
        summary: `${user.name} updated “${objective.title}” to ${value}${unit} (${OBJECTIVE_STATUS[input.status].label})`,
        before: { currentValue: Number(objective.currentValue), status: objective.status },
        after: { currentValue: value, status: input.status },
        feed: objective.status !== input.status,
      },
      tx,
    );
    await notify(
      {
        userIds: [objective.ownerId],
        type: "SYSTEM",
        title: `Progress recorded on “${objective.title}”`,
        body: `${user.name} recorded ${value}${unit} (${OBJECTIVE_STATUS[input.status].label.toLowerCase()})${input.note ? `: ${input.note}` : "."}`,
        link: `/strategy/${objective.id}`,
        excludeUserId: user.id,
      },
      tx,
    );
  });
}

/**
 * Deletes an objective and its check-ins. Quarterly objectives that rolled up to
 * it are kept but unlinked (they surface as "not linked" on the strategy page),
 * and their owners are told so they can re-align them.
 */
export async function deleteObjective(user: SessionUser, id: string) {
  assertCan(user, "strategy.write");
  const objective = await db.objective.findUnique({
    where: { id },
    include: { children: { select: { id: true, title: true, ownerId: true } }, _count: { select: { updates: true } } },
  });
  if (!objective) throw new NotFoundError("Objective");
  await db.$transaction(async (tx) => {
    if (objective.children.length) await tx.objective.updateMany({ where: { parentId: id }, data: { parentId: null } });
    await tx.objective.delete({ where: { id } });
    await audit(
      user,
      {
        action: "objective.deleted",
        module: "strategy",
        entityType: "Objective",
        entityId: id,
        summary: `${user.name} deleted objective “${objective.title}”${objective.children.length ? ` and unlinked ${objective.children.length} quarterly objective${objective.children.length === 1 ? "" : "s"}` : ""}`,
        before: {
          title: objective.title,
          year: objective.year,
          quarter: objective.quarter,
          targetValue: Number(objective.targetValue),
          checkIns: objective._count.updates,
          unlinkedChildren: objective.children.map((c) => ({ id: c.id, title: c.title })),
        },
      },
      tx,
    );
    for (const child of objective.children) {
      await notify(
        {
          userIds: [child.ownerId],
          type: "SYSTEM",
          title: `“${child.title}” is no longer linked to an annual objective`,
          body: `${user.name} deleted the annual objective “${objective.title}”. Link your objective to another annual objective when you next edit it.`,
          link: `/strategy/${child.id}`,
          excludeUserId: user.id,
        },
        tx,
      );
    }
  });
}
