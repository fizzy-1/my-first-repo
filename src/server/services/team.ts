import "server-only";
import { Prisma, type EmploymentType, type UserStatus } from "@prisma/client";
import { addDays } from "@/lib/dates";
import { audit, diffFields } from "@/server/audit";
import { assertCan, can, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { tasksVisibleWhere } from "./tasks";

export interface PerformanceMetrics {
  openTasks: number;
  overdueTasks: number;
  completed90d: number;
  /** Share of tasks completed in 90 days that were done by their due date. */
  onTimeRate: number | null;
  tutorHours30d: number | null;
}

/**
 * Field-level access: the directory (name, role, department, email, status,
 * start date) needs team.read. Cost to company and phone numbers need
 * team.read.sensitive. Performance metrics need team.manage / sensitive access,
 * or the viewer must be the person or their manager.
 */
function canSeePerformance(user: SessionUser, member: { id: string; managerId: string | null }) {
  return can(user, "team.manage") || can(user, "team.read.sensitive") || member.id === user.id || member.managerId === user.id;
}

async function performanceFor(userIds: string[]): Promise<Map<string, PerformanceMetrics>> {
  if (userIds.length === 0) return new Map();
  const since = addDays(new Date(), -90);
  const hoursSince = addDays(new Date(), -30);
  const [tasks, hours] = await Promise.all([
    db.$queryRaw<{ id: string; open: number; overdue: number; completed: number; on_time: number }[]>(Prisma.sql`
      SELECT "assigneeId" AS id,
        COUNT(*) FILTER (WHERE "status" <> 'COMPLETED')::int AS open,
        COUNT(*) FILTER (WHERE "status" <> 'COMPLETED' AND "dueDate" < NOW() AT TIME ZONE 'UTC')::int AS overdue,
        COUNT(*) FILTER (WHERE "status" = 'COMPLETED' AND "completedAt" >= ${since.toISOString()}::timestamptz AT TIME ZONE 'UTC')::int AS completed,
        COUNT(*) FILTER (WHERE "status" = 'COMPLETED' AND "completedAt" >= ${since.toISOString()}::timestamptz AT TIME ZONE 'UTC'
                          AND ("dueDate" IS NULL OR "completedAt" <= "dueDate"))::int AS on_time
      FROM "Task" WHERE "assigneeId" = ANY(${userIds}::text[]) GROUP BY "assigneeId"`),
    db.$queryRaw<{ id: string; hours: number }[]>(Prisma.sql`
      SELECT tp."userId" AS id, COALESCE(SUM(te."hours"), 0)::float AS hours
      FROM "TutorProfile" tp LEFT JOIN "TutorTimeEntry" te ON te."tutorId" = tp."id" AND te."date" >= ${hoursSince.toISOString().slice(0, 10)}::date AND te."status" <> 'REJECTED'
      WHERE tp."userId" = ANY(${userIds}::text[]) GROUP BY tp."userId"`),
  ]);
  const hoursBy = new Map(hours.map((h) => [h.id, h.hours]));
  const out = new Map<string, PerformanceMetrics>();
  for (const id of userIds) {
    const t = tasks.find((x) => x.id === id);
    out.set(id, {
      openTasks: t?.open ?? 0,
      overdueTasks: t?.overdue ?? 0,
      completed90d: t?.completed ?? 0,
      onTimeRate: t && t.completed ? (t.on_time / t.completed) * 100 : null,
      tutorHours30d: hoursBy.has(id) ? Math.round(hoursBy.get(id)! * 10) / 10 : null,
    });
  }
  return out;
}

export async function listTeam(user: SessionUser, opts: { q?: string; departmentId?: string; roleKey?: string; status?: UserStatus }) {
  assertCan(user, "team.read");
  const rows = await db.user.findMany({
    where: {
      AND: [
        opts.status ? { status: opts.status } : { status: { not: "OFFBOARDED" } },
        opts.departmentId ? { departmentId: opts.departmentId } : {},
        opts.roleKey ? { role: { key: opts.roleKey } } : {},
        opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { email: { contains: opts.q, mode: "insensitive" } }, { jobTitle: { contains: opts.q, mode: "insensitive" } }] } : {},
      ],
    },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      jobTitle: true,
      status: true,
      startDate: true,
      employmentType: true,
      phone: true,
      monthlyCost: true,
      managerId: true,
      role: { select: { key: true, name: true } },
      department: { select: { id: true, name: true } },
      manager: { select: { name: true } },
    },
  });
  const sensitive = can(user, "team.read.sensitive");
  const perfIds = rows.filter((r) => canSeePerformance(user, r)).map((r) => r.id);
  const perf = await performanceFor(perfIds);
  return {
    sensitive,
    members: rows.map(({ phone, monthlyCost, ...r }) => ({
      ...r,
      phone: sensitive ? phone : null,
      monthlyCost: sensitive && monthlyCost !== null ? Number(monthlyCost) : null,
      performance: perf.get(r.id) ?? null,
    })),
  };
}

export async function getTeamMember(user: SessionUser, id: string) {
  assertCan(user, "team.read");
  const member = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      jobTitle: true,
      status: true,
      startDate: true,
      employmentType: true,
      phone: true,
      monthlyCost: true,
      managerId: true,
      departmentId: true,
      lastLoginAt: true,
      role: { select: { key: true, name: true } },
      department: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
      reports: { where: { status: "ACTIVE" }, select: { id: true, name: true, jobTitle: true } },
      tutorProfile: { select: { specialisation: true, weeklyCapacityHours: true } },
    },
  });
  if (!member) throw new NotFoundError("Team member");
  const sensitive = can(user, "team.read.sensitive");
  const showPerformance = canSeePerformance(user, member);
  const [perf, tasks] = await Promise.all([
    showPerformance ? performanceFor([id]) : Promise.resolve(new Map<string, PerformanceMetrics>()),
    db.task.findMany({
      where: { AND: [tasksVisibleWhere(user), { assigneeId: id, status: { not: "COMPLETED" } }] },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      take: 15,
      select: { id: true, number: true, title: true, status: true, priority: true, dueDate: true },
    }),
  ]);
  const { phone, monthlyCost, ...rest } = member;
  return {
    ...rest,
    phone: sensitive ? phone : null,
    monthlyCost: sensitive && monthlyCost !== null ? Number(monthlyCost) : null,
    sensitive,
    performance: perf.get(id) ?? null,
    tasks,
    canManage: can(user, "team.manage"),
  };
}

export interface TeamMemberInput {
  jobTitle?: string;
  departmentId?: string;
  managerId?: string;
  employmentType: EmploymentType;
  startDate?: Date;
  phone?: string;
  monthlyCost?: number;
}

export async function updateTeamMember(user: SessionUser, id: string, input: TeamMemberInput) {
  assertCan(user, "team.manage");
  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Team member");
  if (input.managerId === id) throw new ValidationError("A person cannot manage themselves.", { managerId: ["Choose someone else."] });
  const data: Prisma.UserUncheckedUpdateInput & Record<string, unknown> = {
    jobTitle: input.jobTitle ?? null,
    departmentId: input.departmentId ?? null,
    managerId: input.managerId ?? null,
    employmentType: input.employmentType,
    startDate: input.startDate ?? null,
  };
  // Sensitive fields can only be changed by people who can see them.
  if (can(user, "team.read.sensitive")) {
    data.phone = input.phone ?? null;
    data.monthlyCost = input.monthlyCost ?? null;
  }
  const changes = diffFields(existing, data);
  if (!changes) return;
  await db.user.update({ where: { id }, data });
  await audit(user, {
    action: "team.member_updated",
    module: "team",
    entityType: "User",
    entityId: id,
    summary: `${user.name} updated ${existing.name}'s team profile (${Object.keys(changes.after).join(", ")})`,
    // Never copy salary figures into the general audit summary; keep them in the diff only.
    ...changes,
  });
}

export async function departmentHeadcount(user: SessionUser) {
  assertCan(user, "team.read");
  const rows = await db.department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, users: { where: { status: "ACTIVE" }, select: { monthlyCost: true } } },
  });
  const sensitive = can(user, "team.read.sensitive");
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    headcount: d.users.length,
    monthlyCost: sensitive ? d.users.reduce((s, u) => s + Number(u.monthlyCost ?? 0), 0) : null,
  }));
}
