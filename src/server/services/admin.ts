import "server-only";
import { randomInt } from "node:crypto";
import { Prisma, type AnnouncementLevel, type EmploymentType, type UserStatus } from "@prisma/client";
import { endOfSastDay, parseDateInput, sastDate } from "@/lib/dates";
import { PERMISSIONS, ROLE_KEYS, ROLES, type Permission, type RoleKey } from "@/lib/rbac";
import { audit, diffFields } from "@/server/audit";
import { hashPassword, passwordProblems } from "@/server/auth/password";
import { invalidateUserSessions } from "@/server/auth/session";
import { assertCan, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { notify } from "@/server/notify";
import { activeUserOptions, departmentOptions } from "@/server/rbac";

/**
 * Administration: user lifecycle (create, edit, suspend/offboard, password
 * resets, unlocks), the role & permission matrix, the audit trail and company
 * announcements — plus the self-service account data behind /profile.
 */

// ─────────────────────────── Temporary passwords ───────────────────────────

// Ambiguous characters (l/1/I, O/0) are left out so passwords can be read aloud.
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%*-_=+?";
const ALPHABET = LOWER + UPPER + DIGITS + SYMBOLS;

/**
 * A 16-character password from a CSPRNG (~97 bits of entropy) that always
 * satisfies passwordProblems(). It is returned to the administrator once and
 * only its scrypt hash is stored.
 */
function generateTemporaryPassword(length = 16): string {
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALPHABET));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const password = chars.join("");
  if (passwordProblems(password).length) throw new Error("Generated password failed the password policy");
  return password;
}

// ─────────────────────────── Users: guard rails ───────────────────────────

const userInclude = {
  role: { select: { id: true, key: true, name: true } },
  department: { select: { id: true, name: true } },
  manager: { select: { id: true, name: true } },
} as const;

type TargetUser = Prisma.UserGetPayload<{ include: typeof userInclude }>;

async function loadUser(id: string, client: Prisma.TransactionClient = db): Promise<TargetUser> {
  const user = await client.user.findUnique({ where: { id }, include: userInclude });
  if (!user) throw new NotFoundError("User");
  return user;
}

/** Only a Super Admin may touch a Super Admin account (role, status, password, sessions). */
function assertMayManage(actor: SessionUser, target: TargetUser) {
  if (target.role.key === "SUPER_ADMIN" && actor.roleKey !== "SUPER_ADMIN") {
    throw new ForbiddenError("Only a Super Admin can manage Super Admin accounts.");
  }
}

/** Refuses to leave the workspace without an active Super Admin. Run inside a serializable transaction. */
async function assertNotLastSuperAdmin(target: TargetUser, tx: Prisma.TransactionClient, message: string) {
  if (target.role.key !== "SUPER_ADMIN" || target.status !== "ACTIVE") return;
  const others = await tx.user.count({ where: { id: { not: target.id }, status: "ACTIVE", role: { key: "SUPER_ADMIN" } } });
  if (others === 0) throw new ValidationError(message, { roleKey: [message] });
}

/** Walks up the proposed reporting line so nobody ends up (indirectly) managing themselves. */
async function assertNoReportingLoop(userId: string, managerId: string) {
  const seen = new Set<string>();
  let current: string | null = managerId;
  while (current && !seen.has(current)) {
    if (current === userId) throw new ValidationError("That would create a reporting loop.", { managerId: ["This person already reports to them."] });
    seen.add(current);
    const next: { managerId: string | null } | null = await db.user.findUnique({ where: { id: current }, select: { managerId: true } });
    current = next?.managerId ?? null;
  }
}

async function resolveRole(roleKey: RoleKey) {
  const role = await db.role.findUnique({ where: { key: roleKey }, select: { id: true, key: true, name: true } });
  if (!role) throw new ValidationError("That role has not been synced to the database yet.", { roleKey: ["Choose another role."] });
  return role;
}

/**
 * Validates department and manager. When editing, `existing` is the person
 * being edited: keeping their current manager is always allowed (even if that
 * manager has since been suspended); choosing a new one requires an active user.
 */
async function validateOrg(input: { departmentId?: string; managerId?: string }, existing?: { id: string; managerId: string | null }) {
  const [department, manager] = await Promise.all([
    input.departmentId ? db.department.findUnique({ where: { id: input.departmentId }, select: { id: true, name: true } }) : null,
    input.managerId ? db.user.findUnique({ where: { id: input.managerId }, select: { id: true, name: true, status: true } }) : null,
  ]);
  if (input.departmentId && !department) throw new ValidationError("That department no longer exists.", { departmentId: ["Choose a department."] });
  if (input.managerId && input.managerId !== existing?.managerId) {
    if (!manager || manager.status !== "ACTIVE") throw new ValidationError("Managers must be active users.", { managerId: ["Choose an active team member."] });
    if (existing && input.managerId === existing.id) throw new ValidationError("A person cannot manage themselves.", { managerId: ["Choose someone else."] });
    if (existing) await assertNoReportingLoop(existing.id, input.managerId);
  }
  return { department, manager };
}

/** Readable snapshot for audit diffs (names rather than ids). */
function userSnapshot(u: {
  name: string;
  email: string;
  jobTitle: string | null;
  employmentType: EmploymentType;
  role: { name: string };
  department: { name: string } | null;
  manager: { name: string } | null;
}) {
  return {
    name: u.name,
    email: u.email,
    role: u.role.name,
    department: u.department?.name ?? null,
    jobTitle: u.jobTitle,
    manager: u.manager?.name ?? null,
    employmentType: u.employmentType,
  };
}

// ─────────────────────────── Users: queries ───────────────────────────

export type UserSort = "name" | "lastLoginAt" | "createdAt";

export async function listUsers(
  actor: SessionUser,
  opts: { q?: string; roleKey?: RoleKey; departmentId?: string; status?: UserStatus; sort: UserSort; dir: "asc" | "desc"; skip: number; take: number },
) {
  assertCan(actor, "admin.users");
  const now = new Date();
  const where: Prisma.UserWhereInput = {
    AND: [
      opts.roleKey ? { role: { key: opts.roleKey } } : {},
      opts.departmentId ? { departmentId: opts.departmentId } : {},
      opts.status ? { status: opts.status } : {},
      opts.q
        ? {
            OR: [
              { name: { contains: opts.q, mode: "insensitive" } },
              { email: { contains: opts.q, mode: "insensitive" } },
              { jobTitle: { contains: opts.q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };
  const orderBy: Prisma.UserOrderByWithRelationInput[] =
    opts.sort === "lastLoginAt"
      ? [{ lastLoginAt: { sort: opts.dir, nulls: "last" } }, { name: "asc" }]
      : opts.sort === "createdAt"
        ? [{ createdAt: opts.dir }, { name: "asc" }]
        : [{ name: opts.dir }];
  const [rows, total, byStatus, locked] = await Promise.all([
    db.user.findMany({
      where,
      orderBy,
      skip: opts.skip,
      take: opts.take,
      select: {
        id: true,
        name: true,
        email: true,
        jobTitle: true,
        status: true,
        employmentType: true,
        lastLoginAt: true,
        lockedUntil: true,
        failedLoginCount: true,
        mustChangePassword: true,
        createdAt: true,
        departmentId: true,
        managerId: true,
        role: { select: { key: true, name: true } },
        department: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
        _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } },
      },
    }),
    db.user.count({ where }),
    db.user.groupBy({ by: ["status"], _count: { _all: true } }),
    db.user.count({ where: { lockedUntil: { gt: now } } }),
  ]);
  return {
    total,
    counts: {
      ...(Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Partial<Record<UserStatus, number>>),
      locked,
    },
    rows: rows.map(({ _count, ...u }) => ({
      ...u,
      roleKey: u.role.key as RoleKey,
      locked: u.lockedUntil !== null && u.lockedUntil > now,
      activeSessions: _count.sessions,
    })),
  };
}

/** Options for the create / edit user forms. Only a Super Admin is offered the Super Admin role. */
export async function userFormOptions(actor: SessionUser) {
  assertCan(actor, "admin.users");
  const [roles, departments, managers] = await Promise.all([
    db.role.findMany({ select: { key: true, name: true, description: true } }),
    departmentOptions(),
    activeUserOptions(),
  ]);
  const order = new Map(ROLE_KEYS.map((key, i) => [key as string, i]));
  return {
    roles: roles
      .filter((r) => order.has(r.key) && (r.key !== "SUPER_ADMIN" || actor.roleKey === "SUPER_ADMIN"))
      .sort((a, b) => order.get(a.key)! - order.get(b.key)!)
      .map((r) => ({ value: r.key, label: r.name, hint: r.description })),
    departments,
    managers: managers.map(({ value, label, hint }) => ({ value, label, hint })),
  };
}

// ─────────────────────────── Users: mutations ───────────────────────────

export interface UserInput {
  name: string;
  email: string;
  roleKey: RoleKey;
  departmentId?: string;
  jobTitle?: string;
  managerId?: string;
  employmentType: EmploymentType;
}

export async function createUser(actor: SessionUser, input: UserInput) {
  assertCan(actor, "admin.users");
  if (input.roleKey === "SUPER_ADMIN" && actor.roleKey !== "SUPER_ADMIN") throw new ForbiddenError("Only a Super Admin can grant the Super Admin role.");
  const [role, existing] = await Promise.all([resolveRole(input.roleKey), db.user.findUnique({ where: { email: input.email }, select: { id: true } })]);
  if (existing) throw new ValidationError("Someone already uses that email address.", { email: ["A user with this email already exists."] });
  const { department, manager } = await validateOrg(input);

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        mustChangePassword: true,
        status: "ACTIVE",
        roleId: role.id,
        departmentId: department?.id ?? null,
        managerId: manager?.id ?? null,
        jobTitle: input.jobTitle ?? null,
        employmentType: input.employmentType,
      },
      select: { id: true, name: true, email: true },
    });
    await audit(
      actor,
      {
        action: "admin.user_created",
        module: "admin",
        entityType: "User",
        entityId: created.id,
        summary: `${actor.name} created an account for ${created.name} (${role.name}) with a temporary password`,
        after: { ...userSnapshot({ ...input, jobTitle: input.jobTitle ?? null, role, department, manager }), mustChangePassword: true },
      },
      tx,
    );
    await notify(
      {
        userIds: [created.id],
        type: "SYSTEM",
        title: "Welcome to the Integral Academy workspace",
        body: `${actor.name} created your account. Choose a new password on your profile to get started.`,
        link: "/profile",
        dedupeKey: `welcome:${created.id}`,
      },
      tx,
    );
    return created;
  });
  return { user, temporaryPassword };
}

export async function updateUser(actor: SessionUser, id: string, input: UserInput) {
  assertCan(actor, "admin.users");
  const target = await loadUser(id);
  assertMayManage(actor, target);
  const roleChanged = input.roleKey !== target.role.key;
  if (roleChanged && target.id === actor.id) throw new ValidationError("You can't change your own role.", { roleKey: ["Ask another Super Admin to change your role."] });
  if (roleChanged && input.roleKey === "SUPER_ADMIN" && actor.roleKey !== "SUPER_ADMIN") throw new ForbiddenError("Only a Super Admin can grant the Super Admin role.");
  if (input.email !== target.email) {
    const taken = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (taken) throw new ValidationError("Someone already uses that email address.", { email: ["A user with this email already exists."] });
  }
  const [role, { department, manager }] = await Promise.all([resolveRole(input.roleKey), validateOrg(input, target)]);

  const changes = diffFields(userSnapshot(target), userSnapshot({ ...input, jobTitle: input.jobTitle ?? null, role, department, manager }));
  if (!changes) return target;

  await db.$transaction(
    async (tx) => {
      if (roleChanged) await assertNotLastSuperAdmin(await loadUser(id, tx), tx, "This is the last active Super Admin. Grant the role to someone else first.");
      await tx.user.update({
        where: { id },
        data: {
          name: input.name,
          email: input.email,
          roleId: role.id,
          departmentId: department?.id ?? null,
          managerId: manager?.id ?? null,
          jobTitle: input.jobTitle ?? null,
          employmentType: input.employmentType,
        },
      });
      await audit(
        actor,
        {
          action: roleChanged ? "admin.user_role_changed" : "admin.user_updated",
          module: "admin",
          entityType: "User",
          entityId: id,
          summary: roleChanged
            ? `${actor.name} changed ${target.name}'s role from ${target.role.name} to ${role.name}`
            : `${actor.name} updated ${target.name}'s account (${Object.keys(changes.after).join(", ")})`,
          ...changes,
        },
        tx,
      );
      if (roleChanged) {
        await notify(
          {
            userIds: [id],
            type: "SYSTEM",
            title: `Your role is now ${role.name}`,
            body: `${actor.name} changed your role from ${target.role.name} to ${role.name}. Your access has been updated.`,
            link: "/profile",
            excludeUserId: actor.id,
          },
          tx,
        );
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  return target;
}

export type ManagedStatus = Extract<UserStatus, "ACTIVE" | "SUSPENDED" | "OFFBOARDED">;

/** Suspending or offboarding signs the person out everywhere immediately. */
export async function setUserStatus(actor: SessionUser, id: string, status: ManagedStatus) {
  assertCan(actor, "admin.users");
  const target = await loadUser(id);
  assertMayManage(actor, target);
  if (target.status === status) return { target, sessionsRevoked: 0 };
  if (target.id === actor.id) throw new ValidationError("You can't suspend or offboard your own account.");

  await db.$transaction(
    async (tx) => {
      if (status !== "ACTIVE") await assertNotLastSuperAdmin(await loadUser(id, tx), tx, "This is the last active Super Admin and can't be suspended or offboarded.");
      await tx.user.update({ where: { id }, data: { status } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  // Sessions of non-active users are already refused at validation time; deleting
  // them as well makes the sign-out explicit and frees the rows.
  let sessionsRevoked = 0;
  if (status !== "ACTIVE") {
    sessionsRevoked = await db.session.count({ where: { userId: id } });
    await invalidateUserSessions(id);
  }
  const verb = status === "ACTIVE" ? "reactivated" : status === "SUSPENDED" ? "suspended" : "offboarded";
  await audit(actor, {
    action: `admin.user_${verb}`,
    module: "admin",
    entityType: "User",
    entityId: id,
    summary: `${actor.name} ${verb} ${target.name}${sessionsRevoked ? ` and signed out ${sessionsRevoked} session${sessionsRevoked === 1 ? "" : "s"}` : ""}`,
    before: { status: target.status },
    after: { status },
  });
  return { target, sessionsRevoked };
}

/** Issues a new temporary password, forces a change on next sign-in and signs the person out everywhere. */
export async function resetUserPassword(actor: SessionUser, id: string) {
  assertCan(actor, "admin.users");
  const target = await loadUser(id);
  assertMayManage(actor, target);
  if (target.id === actor.id) throw new ValidationError("Change your own password from your profile instead.");

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  // The new hash and the session revocation commit together, so no device stays
  // signed in on the old credentials if anything fails half-way.
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      // A reset also clears any sign-in lock, since the old password is no longer valid.
      data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    const { count } = await tx.session.deleteMany({ where: { userId: id } });
    await audit(
      actor,
      {
        action: "admin.password_reset",
        module: "admin",
        entityType: "User",
        entityId: id,
        summary: `${actor.name} reset ${target.name}'s password and issued a temporary one${count ? ` (${count} session${count === 1 ? "" : "s"} signed out)` : ""}`,
        before: { mustChangePassword: target.mustChangePassword },
        after: { mustChangePassword: true },
      },
      tx,
    );
    await notify(
      {
        userIds: [id],
        type: "SYSTEM",
        title: "Your password was reset",
        body: `${actor.name} issued you a temporary password. If you didn't ask for this, contact an administrator.`,
        link: "/profile",
      },
      tx,
    );
  });
  return { user: { id: target.id, name: target.name, email: target.email }, temporaryPassword };
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Clears the account lock and the recent failed attempts that would otherwise keep sign-in throttled. */
export async function unlockUser(actor: SessionUser, id: string) {
  assertCan(actor, "admin.users");
  const target = await loadUser(id);
  assertMayManage(actor, target);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null } });
    await tx.loginAttempt.deleteMany({ where: { email: target.email, success: false, createdAt: { gte: new Date(Date.now() - LOGIN_WINDOW_MS) } } });
    await audit(
      actor,
      {
        action: "admin.user_unlocked",
        module: "admin",
        entityType: "User",
        entityId: id,
        summary: `${actor.name} unlocked ${target.name}'s account`,
        before: { failedLoginCount: target.failedLoginCount, lockedUntil: target.lockedUntil },
        after: { failedLoginCount: 0, lockedUntil: null },
      },
      tx,
    );
  });
  return target;
}

export async function revokeUserSessions(actor: SessionUser, id: string) {
  assertCan(actor, "admin.users");
  const target = await loadUser(id);
  assertMayManage(actor, target);
  if (target.id === actor.id) throw new ValidationError("Use “Sign out other sessions” on your profile instead.");
  const count = await db.session.count({ where: { userId: id } });
  await invalidateUserSessions(id);
  await audit(actor, {
    action: "admin.sessions_revoked",
    module: "admin",
    entityType: "User",
    entityId: id,
    summary: `${actor.name} signed ${target.name} out of ${count} session${count === 1 ? "" : "s"}`,
  });
  return { target, count };
}

// ─────────────────────────── Roles & permissions ───────────────────────────

/**
 * The code-defined role matrix (src/lib/rbac.ts) with live head counts, plus a
 * comparison against the database copy so drift after a deploy is visible.
 */
export async function getRoleMatrix(actor: SessionUser) {
  assertCan(actor, "admin.roles");
  const [dbRoles, dbPermissions, counts] = await Promise.all([
    db.role.findMany({ select: { id: true, key: true, permissions: { select: { permission: { select: { key: true } } } } } }),
    db.permission.findMany({ select: { key: true } }),
    db.user.groupBy({ by: ["roleId"], where: { status: "ACTIVE" }, _count: { _all: true } }),
  ]);
  const byKey = new Map(dbRoles.map((r) => [r.key, r]));
  const activeByRoleId = new Map(counts.map((c) => [c.roleId, c._count._all]));

  const roles = ROLE_KEYS.map((key) => {
    const def = ROLES[key];
    const dbRole = byKey.get(key);
    const granted = new Set<string>(def.permissions);
    const stored = new Set(dbRole?.permissions.map((p) => p.permission.key) ?? []);
    const differences = [...granted].filter((p) => !stored.has(p)).length + [...stored].filter((p) => !granted.has(p)).length;
    return {
      key,
      name: def.name,
      description: def.description,
      permissionCount: def.permissions.length,
      activeUsers: dbRole ? (activeByRoleId.get(dbRole.id) ?? 0) : 0,
      synced: Boolean(dbRole) && differences === 0,
      differences: dbRole ? differences : null,
    };
  });

  const modules = new Map<string, { key: Permission; description: string; roles: RoleKey[] }[]>();
  for (const [key, def] of Object.entries(PERMISSIONS) as [Permission, (typeof PERMISSIONS)[Permission]][]) {
    const list = modules.get(def.module) ?? [];
    list.push({ key, description: def.description, roles: ROLE_KEYS.filter((r) => ROLES[r].permissions.includes(key)) });
    modules.set(def.module, list);
  }
  const codeKeys = new Set<string>(Object.keys(PERMISSIONS));
  const storedKeys = new Set(dbPermissions.map((p) => p.key));
  return {
    roles,
    modules: [...modules.entries()].map(([module, permissions]) => ({ module, permissions })),
    permissionDrift: [...codeKeys].filter((k) => !storedKeys.has(k)).length + [...storedKeys].filter((k) => !codeKeys.has(k)).length,
  };
}

// ─────────────────────────── Audit log ───────────────────────────

export interface AuditFilters {
  q?: string;
  /** A user id, or "system" for entries without an actor. */
  actor?: string;
  module?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  /** Inclusive SAST calendar days (YYYY-MM-DD). */
  from?: string;
  to?: string;
}

const TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * Parses audit filters from URL parameters. Shared by the audit page and the
 * CSV export so both apply exactly the same filters.
 */
export function auditFiltersFromParams(get: (name: string) => string | null | undefined): AuditFilters {
  const token = (name: string) => {
    const v = get(name)?.trim();
    return v && TOKEN.test(v) ? v : undefined;
  };
  const day = (name: string) => {
    const v = get(name)?.trim();
    return v && parseDateInput(v) ? v : undefined;
  };
  return {
    q: get("q")?.trim().slice(0, 100) || undefined,
    actor: token("actor"),
    module: token("module"),
    action: token("action"),
    entityType: token("entityType"),
    entityId: token("entityId"),
    from: day("from"),
    to: day("to"),
  };
}

export function auditLogWhere(f: AuditFilters): Prisma.AuditLogWhereInput {
  const from = f.from ? parseDateInput(f.from) : null;
  const to = f.to ? parseDateInput(f.to) : null;
  return {
    AND: [
      f.actor === "system" ? { actorId: null } : f.actor ? { actorId: f.actor } : {},
      f.module ? { module: f.module } : {},
      f.action ? { action: f.action } : {},
      f.entityType ? { entityType: f.entityType } : {},
      f.entityId ? { entityId: f.entityId } : {},
      from ? { createdAt: { gte: sastDate(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) } } : {},
      to ? { createdAt: { lte: endOfSastDay(to) } } : {},
      f.q ? { OR: [{ summary: { contains: f.q, mode: "insensitive" } }, { entityId: f.q }] } : {},
    ],
  };
}

export async function listAuditLogs(actor: SessionUser, filters: AuditFilters, page: { dir: "asc" | "desc"; skip: number; take: number }) {
  assertCan(actor, "audit.read");
  const where = auditLogWhere(filters);
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: page.dir }, { id: page.dir }],
      skip: page.skip,
      take: page.take,
      select: {
        id: true,
        createdAt: true,
        action: true,
        module: true,
        entityType: true,
        entityId: true,
        summary: true,
        before: true,
        after: true,
        ipAddress: true,
        actor: { select: { id: true, name: true, email: true } },
      },
    }),
    db.auditLog.count({ where }),
  ]);
  return { rows, total };
}

/** A readable name for the record an audit history is filtered to (null when unknown or deleted). */
export async function describeAuditEntity(actor: SessionUser, entityType: string, entityId: string): Promise<string | null> {
  assertCan(actor, "audit.read");
  if (entityType === "User") return (await db.user.findUnique({ where: { id: entityId }, select: { name: true } }))?.name ?? null;
  if (entityType === "Announcement") return (await db.announcement.findUnique({ where: { id: entityId }, select: { title: true } }))?.title ?? null;
  return null;
}

/** Distinct values for the audit filters (only values that actually occur). */
export async function auditFilterOptions(actor: SessionUser) {
  assertCan(actor, "audit.read");
  const [modules, actions, entityTypes, actors] = await Promise.all([
    db.auditLog.groupBy({ by: ["module"], orderBy: { module: "asc" } }),
    db.auditLog.groupBy({ by: ["action"], orderBy: { action: "asc" } }),
    db.auditLog.groupBy({ by: ["entityType"], orderBy: { entityType: "asc" } }),
    db.user.findMany({ where: { auditLogs: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    modules: modules.map((m) => m.module),
    actions: actions.map((a) => a.action),
    entityTypes: entityTypes.map((e) => e.entityType),
    actors: actors.map((a) => ({ value: a.id, label: a.name })),
  };
}

// ─────────────────────────── Announcements ───────────────────────────

export type AnnouncementState = "live" | "scheduled" | "expired";

/**
 * Matches the dashboard's selection: an announcement is live once published and
 * until it expires. Expired wins over scheduled (an announcement ended before
 * it went out never shows).
 */
function announcementStateWhere(state: AnnouncementState, now: Date): Prisma.AnnouncementWhereInput {
  const notExpired: Prisma.AnnouncementWhereInput = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  if (state === "live") return { AND: [{ publishedAt: { lte: now } }, notExpired] };
  if (state === "scheduled") return { AND: [{ publishedAt: { gt: now } }, notExpired] };
  return { expiresAt: { lte: now } };
}

function announcementState(a: { publishedAt: Date; expiresAt: Date | null }, now: Date): AnnouncementState {
  if (a.expiresAt && a.expiresAt <= now) return "expired";
  return a.publishedAt > now ? "scheduled" : "live";
}

export async function listAnnouncements(actor: SessionUser, opts: { state?: AnnouncementState; skip: number; take: number }) {
  assertCan(actor, "announcements.write");
  const now = new Date();
  const where = opts.state ? announcementStateWhere(opts.state, now) : {};
  const [rows, total, live, scheduled, expired] = await Promise.all([
    db.announcement.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip: opts.skip,
      take: opts.take,
      include: { author: { select: { id: true, name: true } } },
    }),
    db.announcement.count({ where }),
    db.announcement.count({ where: announcementStateWhere("live", now) }),
    db.announcement.count({ where: announcementStateWhere("scheduled", now) }),
    db.announcement.count({ where: announcementStateWhere("expired", now) }),
  ]);
  return {
    total,
    counts: { live, scheduled, expired, all: live + scheduled + expired },
    rows: rows.map((a) => ({ ...a, state: announcementState(a, now) })),
  };
}

export interface AnnouncementInput {
  title: string;
  body: string;
  level: AnnouncementLevel;
  publishedAt?: Date;
  expiresAt?: Date;
}

function validateAnnouncementWindow(publishedAt: Date, expiresAt: Date | null) {
  if (expiresAt && expiresAt <= publishedAt) {
    throw new ValidationError("The announcement must expire after it is published.", { expiresAt: ["Choose a time after the publish time."] });
  }
}

export async function createAnnouncement(actor: SessionUser, input: AnnouncementInput & { notifyEveryone: boolean }) {
  assertCan(actor, "announcements.write");
  const now = new Date();
  const publishedAt = input.publishedAt ?? now;
  const expiresAt = input.expiresAt ?? null;
  validateAnnouncementWindow(publishedAt, expiresAt);
  if (expiresAt && expiresAt <= now) throw new ValidationError("The expiry time has already passed.", { expiresAt: ["Choose a time in the future."] });
  if (input.notifyEveryone && publishedAt > now) {
    throw new ValidationError("Notifications go out immediately, so they can only be sent for announcements published now.", {
      notifyEveryone: ["Untick this, or leave the publish time empty."],
    });
  }
  return db.$transaction(async (tx) => {
    const announcement = await tx.announcement.create({
      data: { title: input.title, body: input.body, level: input.level, publishedAt, expiresAt, authorId: actor.id },
    });
    let notified = 0;
    if (input.notifyEveryone) {
      const recipients = await tx.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
      notified = await notify(
        {
          userIds: recipients.map((r) => r.id),
          type: "ANNOUNCEMENT",
          title: announcement.title,
          body: announcement.body.slice(0, 300),
          link: "/dashboard",
          dedupeKey: `announcement:${announcement.id}`,
          excludeUserId: actor.id,
        },
        tx,
      );
    }
    await audit(
      actor,
      {
        action: "announcement.created",
        module: "announcements",
        entityType: "Announcement",
        entityId: announcement.id,
        summary: `${actor.name} ${publishedAt > now ? "scheduled" : "published"} the announcement “${announcement.title}”${notified ? ` and notified ${notified} people` : ""}`,
        after: { title: announcement.title, level: announcement.level, publishedAt, expiresAt },
      },
      tx,
    );
    return { announcement, notified };
  });
}

async function loadAnnouncement(id: string) {
  const announcement = await db.announcement.findUnique({ where: { id } });
  if (!announcement) throw new NotFoundError("Announcement");
  return announcement;
}

export async function updateAnnouncement(actor: SessionUser, id: string, input: AnnouncementInput) {
  assertCan(actor, "announcements.write");
  const existing = await loadAnnouncement(id);
  const data = { title: input.title, body: input.body, level: input.level, publishedAt: input.publishedAt ?? new Date(), expiresAt: input.expiresAt ?? null };
  validateAnnouncementWindow(data.publishedAt, data.expiresAt);
  const changes = diffFields(existing, data);
  if (!changes) return existing;
  await db.$transaction(async (tx) => {
    await tx.announcement.update({ where: { id }, data });
    await audit(
      actor,
      {
        action: "announcement.updated",
        module: "announcements",
        entityType: "Announcement",
        entityId: id,
        summary: `${actor.name} updated the announcement “${data.title}” (${Object.keys(changes.after).join(", ")})`,
        ...changes,
      },
      tx,
    );
  });
  return existing;
}

export async function expireAnnouncement(actor: SessionUser, id: string) {
  assertCan(actor, "announcements.write");
  const existing = await loadAnnouncement(id);
  const now = new Date();
  if (existing.expiresAt && existing.expiresAt <= now) return existing;
  await db.$transaction(async (tx) => {
    await tx.announcement.update({ where: { id }, data: { expiresAt: now } });
    await audit(
      actor,
      {
        action: "announcement.expired",
        module: "announcements",
        entityType: "Announcement",
        entityId: id,
        summary: `${actor.name} took down the announcement “${existing.title}”`,
        before: { expiresAt: existing.expiresAt },
        after: { expiresAt: now },
      },
      tx,
    );
  });
  return existing;
}

export async function deleteAnnouncement(actor: SessionUser, id: string) {
  assertCan(actor, "announcements.write");
  const existing = await loadAnnouncement(id);
  await db.$transaction(async (tx) => {
    await tx.announcement.delete({ where: { id } });
    await audit(
      actor,
      {
        action: "announcement.deleted",
        module: "announcements",
        entityType: "Announcement",
        entityId: id,
        summary: `${actor.name} deleted the announcement “${existing.title}”`,
        before: { title: existing.title, level: existing.level, publishedAt: existing.publishedAt, expiresAt: existing.expiresAt },
      },
      tx,
    );
  });
}

// ─────────────────────────── Profile (self-service) ───────────────────────────

export async function getMyAccount(user: SessionUser) {
  const account = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      jobTitle: true,
      employmentType: true,
      startDate: true,
      createdAt: true,
      lastLoginAt: true,
      passwordChangedAt: true,
      mustChangePassword: true,
      role: { select: { name: true, description: true } },
      department: { select: { name: true } },
      manager: { select: { name: true, jobTitle: true } },
    },
  });
  if (!account) throw new NotFoundError("Account");
  return account;
}

/** The signed-in user's unexpired sessions, most recently active first. */
export async function listMySessions(user: SessionUser) {
  const sessions = await db.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, ipAddress: true, userAgent: true },
  });
  return sessions.map((s) => ({ ...s, current: s.id === user.sessionId }));
}

/** Signs one of the user's other devices out (the current session uses Log out). */
export async function revokeMySession(user: SessionUser, sessionId: string) {
  if (sessionId === user.sessionId) throw new ValidationError("Use Log out to end this session.");
  const { count } = await db.session.deleteMany({ where: { id: sessionId, userId: user.id } });
  if (count === 0) throw new NotFoundError("Session");
  await audit(user, {
    action: "auth.session_revoked",
    module: "admin",
    entityType: "User",
    entityId: user.id,
    summary: `${user.name} signed out one of their other sessions`,
  });
}
