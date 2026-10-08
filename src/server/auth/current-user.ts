import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Permission, RoleKey } from "@/lib/rbac";
import { hasAny, hasPermission } from "@/lib/rbac";
import { ForbiddenError } from "@/server/errors";
import { clientIp } from "./client-ip";
import { SESSION_COOKIE, validateSessionToken } from "./session";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  roleKey: RoleKey;
  roleName: string;
  departmentId: string | null;
  departmentName: string | null;
  permissions: ReadonlySet<Permission>;
  sessionId: string;
  /** Set while the user still has an administrator-issued temporary password. */
  mustChangePassword: boolean;
}

/**
 * Resolves the signed-in user for the current request (memoised per request).
 * Permissions come from the database role, so changes apply on the next request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await validateSessionToken(token);
  if (!session) return null;
  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    jobTitle: user.jobTitle,
    roleKey: user.role.key as RoleKey,
    roleName: user.role.name,
    departmentId: user.departmentId,
    departmentName: user.department?.name ?? null,
    permissions: new Set(user.role.permissions.map((rp) => rp.permission.key as Permission)),
    sessionId: session.id,
    mustChangePassword: user.mustChangePassword,
  };
});

/** Pages a user with a temporary password may still open (the proxy passes the path in x-pathname). */
const PASSWORD_SETUP_PATHS = ["/profile"];

/**
 * For pages, layouts and server actions: redirects to /login when signed out, and
 * keeps people with a temporary password on /profile until they choose their own.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) {
    const pathname = (await headers()).get("x-pathname");
    if (pathname && !PASSWORD_SETUP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) redirect("/profile?setup=1");
  }
  return user;
}

/** For API routes: the signed-in user, or null when signed out or still on a temporary password. */
export async function getApiUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && !user.mustChangePassword ? user : null;
}

/** For pages: requires ANY of the given permissions, else shows the access-denied page. */
export async function requirePageAccess(...permissions: Permission[]): Promise<SessionUser> {
  const user = await requireUser();
  if (permissions.length > 0 && !hasAny(user, permissions)) redirect("/access-denied");
  return user;
}

export function can(user: SessionUser, permission: Permission): boolean {
  return hasPermission(user, permission);
}

export function canAny(user: SessionUser, permissions: readonly Permission[]): boolean {
  return hasAny(user, permissions);
}

/** For services: throws ForbiddenError unless the user holds ANY of the permissions. */
export function assertCan(user: SessionUser, ...permissions: Permission[]): void {
  if (!hasAny(user, permissions)) throw new ForbiddenError();
}

export async function getRequestMeta(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    return { ipAddress: clientIp(h.get("x-forwarded-for"), h.get("x-real-ip")), userAgent: h.get("user-agent") };
  } catch {
    // Outside a request (scripts / jobs).
    return { ipAddress: null, userAgent: null };
  }
}
