import "server-only";
import type { ObjectiveMetric, ObjectiveStatus, Prisma } from "@prisma/client";
import { sastYear, quarterOf } from "@/lib/dates";
import { OBJECTIVE_STATUS } from "@/lib/labels";
import { clamp } from "@/lib/utils";
import { audit, diffFields } from "@/server/audit";
import { assertCan, can, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { learnerPlatform } from "@/server/integrations/learner-platform";
import { cashBalanceAt, mrrAt } from "./metrics";

/** Resolves live values for metric-linked objectives (one query per metric type used). */
async function liveMetricValues(metrics: Set<ObjectiveMetric>): Promise<Partial<Record<ObjectiveMetric, number>>> {
  const now = new Date();
  const values: Partial<Record<ObjectiveMetric, number>> = {};
  const jobs: Promise<void>[] = [];
  if (metrics.has("PAYING_LEARNERS") || metrics.has("ACTIVE_LEARNERS")) {
    jobs.push(
      learnerPlatform.snapshotAt(now).then((s) => {
        values.PAYING_LEARNERS = s.payingLearners;
        values.ACTIVE_LEARNERS = s.activeLearners;
      }),
    );
  }
  if (metrics.has("MRR")) jobs.push(mrrAt(now).then((m) => void (values.MRR = Math.round(m.total))));
  if (metrics.has("ACTIVE_SCHOOLS")) jobs.push(db.partnership.count({ where: { status: "ACTIVE" } }).then((n) => void (values.ACTIVE_SCHOOLS = n)));
  if (metrics.has("CASH_BALANCE")) jobs.push(cashBalanceAt(now).then((c) => void (values.CASH_BALANCE = Math.round(c))));
  if (metrics.has("PUBLISHED_CONTENT")) {
    jobs.push(db.contentItem.count({ where: { stage: "PUBLISHED" } }).then((n) => void (values.PUBLISHED_CONTENT = n)));
  }
  await Promise.all(jobs);
  return values;
}

export function objectiveProgress(start: number, target: number, current: number): number {
  if (target === start) return current >= target ? 100 : 0;
  return clamp(((current - start) / (target - start)) * 100, 0, 100);
}

type ObjectiveRow = Prisma.ObjectiveGetPayload<{
  include: { owner: { select: { id: true; name: true } }; department: { select: { name: true } } };
}>;

async function withProgress(rows: ObjectiveRow[]) {
  const live = await liveMetricValues(new Set(rows.map((r) => r.metric).filter((m) => m !== "MANUAL")));
  return rows.map((o) => {
    const startValue = Number(o.startValue);
    const targetValue = Number(o.targetValue);
    const currentValue = o.metric !== "MANUAL" && live[o.metric] !== undefined ? live[o.metric]! : Number(o.currentValue);
    return {
      ...o,
      startValue,
      targetValue,
      currentValue,
      isLive: o.metric !== "MANUAL",
      progress: objectiveProgress(startValue, targetValue, currentValue),
    };
  });
}

export type ObjectiveWithProgress = Awaited<ReturnType<typeof withProgress>>[number];

export async function listObjectives(user: SessionUser, opts: { year?: number; quarter?: number | null } = {}) {
  assertCan(user, "strategy.read");
  const year = opts.year ?? sastYear(new Date());
  const rows = await db.objective.findMany({
    where: { year, ...(opts.quarter !== undefined ? { quarter: opts.quarter } : {}) },
    orderBy: [{ quarter: { sort: "asc", nulls: "first" } }, { deadline: "asc" }],
    include: { owner: { select: { id: true, name: true } }, department: { select: { name: true } } },
  });
  return withProgress(rows);
}

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

export async function getObjective(user: SessionUser, id: string) {
  assertCan(user, "strategy.read");
  const row = await db.objective.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      department: { select: { name: true } },
      updates: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      children: { select: { id: true } },
      parent: { select: { id: true, title: true } },
    },
  });
  if (!row) throw new NotFoundError("Objective");
  const [withP] = await withProgress([row]);
  return { ...withP, updates: row.updates.map((u) => ({ ...u, value: Number(u.value) })), parent: row.parent };
}

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

export async function createObjective(user: SessionUser, input: ObjectiveInput) {
  assertCan(user, "strategy.write");
  if (input.targetValue === input.startValue) throw new ValidationError("Target must differ from the starting value.", { targetValue: ["Must differ from the start value."] });
  const objective = await db.objective.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      ownerId: input.ownerId,
      departmentId: input.departmentId ?? null,
      parentId: input.parentId ?? null,
      year: input.year,
      quarter: input.quarter ?? null,
      metric: input.metric,
      unit: input.unit ?? "",
      startValue: input.startValue,
      targetValue: input.targetValue,
      currentValue: input.currentValue ?? input.startValue,
      deadline: input.deadline,
      status: input.status,
    },
  });
  await audit(user, {
    action: "objective.created",
    module: "strategy",
    entityType: "Objective",
    entityId: objective.id,
    summary: `${user.name} created objective “${objective.title}” (target ${input.targetValue}${input.unit ? ` ${input.unit}` : ""})`,
    after: { title: objective.title, targetValue: input.targetValue, deadline: objective.deadline },
    feed: true,
  });
  return objective;
}

export async function updateObjective(user: SessionUser, id: string, input: ObjectiveInput) {
  assertCan(user, "strategy.write");
  const existing = await db.objective.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Objective");
  const data = {
    title: input.title,
    description: input.description ?? null,
    ownerId: input.ownerId,
    departmentId: input.departmentId ?? null,
    parentId: input.parentId && input.parentId !== id ? input.parentId : null,
    year: input.year,
    quarter: input.quarter ?? null,
    metric: input.metric,
    unit: input.unit ?? "",
    startValue: input.startValue,
    targetValue: input.targetValue,
    deadline: input.deadline,
    status: input.status,
  };
  const changes = diffFields(existing, data);
  await db.objective.update({ where: { id }, data });
  if (changes) {
    await audit(user, {
      action: "objective.updated",
      module: "strategy",
      entityType: "Objective",
      entityId: id,
      summary: `${user.name} updated objective “${input.title}”`,
      ...changes,
    });
  }
}

/** Records a progress check-in (value + status + note) and updates the objective. */
export async function recordObjectiveUpdate(user: SessionUser, input: { id: string; value?: number; status: ObjectiveStatus; note?: string }) {
  const objective = await db.objective.findUnique({ where: { id: input.id } });
  if (!objective) throw new NotFoundError("Objective");
  if (!can(user, "strategy.write") && objective.ownerId !== user.id) assertCan(user, "strategy.write");
  const value = objective.metric === "MANUAL" ? (input.value ?? Number(objective.currentValue)) : Number(objective.currentValue);
  await db.$transaction([
    db.objective.update({ where: { id: input.id }, data: { status: input.status, ...(objective.metric === "MANUAL" ? { currentValue: value } : {}) } }),
    db.objectiveUpdate.create({ data: { objectiveId: input.id, value, status: input.status, note: input.note ?? null, authorId: user.id } }),
  ]);
  await audit(user, {
    action: "objective.progress",
    module: "strategy",
    entityType: "Objective",
    entityId: input.id,
    summary: `${user.name} updated “${objective.title}” to ${value}${objective.unit ? ` ${objective.unit}` : ""} (${OBJECTIVE_STATUS[input.status].label})`,
    before: { currentValue: Number(objective.currentValue), status: objective.status },
    after: { currentValue: value, status: input.status },
    feed: objective.status !== input.status,
  });
}

export async function deleteObjective(user: SessionUser, id: string) {
  assertCan(user, "strategy.write");
  const objective = await db.objective.findUnique({ where: { id } });
  if (!objective) throw new NotFoundError("Objective");
  await db.objective.delete({ where: { id } });
  await audit(user, {
    action: "objective.deleted",
    module: "strategy",
    entityType: "Objective",
    entityId: id,
    summary: `${user.name} deleted objective “${objective.title}”`,
    before: { title: objective.title, targetValue: Number(objective.targetValue) },
  });
}
