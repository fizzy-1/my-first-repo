"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formAction, type ActionState } from "@/server/action";
import { audit } from "@/server/audit";
import { getCurrentUser, getRequestMeta } from "@/server/auth/current-user";
import { getDummyHash, hashPassword, needsRehash, passwordProblems, verifyPassword } from "@/server/auth/password";
import {
  SESSION_COOKIE,
  createSession,
  invalidateSession,
  invalidateUserSessions,
  sessionCookieOptions,
} from "@/server/auth/session";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_PER_IP = 20;
const MAX_FAILED_PER_EMAIL = 8;
const LOCK_AFTER_FAILURES = 5;

const INVALID = "Invalid email or password.";
const THROTTLED = "Too many sign-in attempts. Please wait 15 minutes and try again.";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

/** Only allow same-site relative redirects (prevents open redirects). */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/login")) {
    return "/dashboard";
  }
  return next;
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    next: formData.get("next") ?? undefined,
  });
  const email = typeof formData.get("email") === "string" ? String(formData.get("email")).slice(0, 254) : "";
  if (!parsed.success) return { ok: false, message: INVALID, values: { email } };

  const { ipAddress, userAgent } = await getRequestMeta();
  const since = new Date(Date.now() - WINDOW_MS);
  const [ipFailures, emailFailures] = await Promise.all([
    ipAddress ? db.loginAttempt.count({ where: { ipAddress, success: false, createdAt: { gte: since } } }) : 0,
    db.loginAttempt.count({ where: { email: parsed.data.email, success: false, createdAt: { gte: since } } }),
  ]);
  if (ipFailures >= MAX_FAILED_PER_IP || emailFailures >= MAX_FAILED_PER_EMAIL) {
    return { ok: false, message: THROTTLED, values: { email } };
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const recordAttempt = (success: boolean) =>
    db.loginAttempt.create({ data: { email: parsed.data.email, ipAddress, success } });

  if (!user) {
    // Constant-time-ish: still run a hash comparison for unknown accounts.
    await verifyPassword(parsed.data.password, await getDummyHash());
    await recordAttempt(false);
    return { ok: false, message: INVALID, values: { email } };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAttempt(false);
    return { ok: false, message: THROTTLED, values: { email } };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    const failures = user.failedLoginCount + 1;
    const lock = failures >= LOCK_AFTER_FAILURES;
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: lock ? 0 : failures, lockedUntil: lock ? new Date(Date.now() + WINDOW_MS) : user.lockedUntil },
    });
    await recordAttempt(false);
    if (lock) {
      await audit(null, {
        action: "auth.locked",
        module: "admin",
        entityType: "User",
        entityId: user.id,
        summary: `Account ${user.email} locked for 15 minutes after ${LOCK_AFTER_FAILURES} failed sign-in attempts`,
      });
    }
    return { ok: false, message: INVALID, values: { email } };
  }

  if (user.status !== "ACTIVE") {
    await recordAttempt(false);
    return { ok: false, message: "This account is not active. Please contact an administrator.", values: { email } };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(parsed.data.password) } : {}),
    },
  });
  await recordAttempt(true);

  const { token, expiresAt } = await createSession(user.id, { ipAddress, userAgent });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  await audit(user, {
    action: "auth.login",
    module: "admin",
    entityType: "User",
    entityId: user.id,
    summary: `${user.name} signed in`,
  });

  redirect(safeNext(parsed.data.next));
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  if (user) {
    await invalidateSession(user.sessionId);
    await audit(user, { action: "auth.logout", module: "admin", entityType: "User", entityId: user.id, summary: `${user.name} signed out` });
  }
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(200),
    newPassword: z.string().max(200),
    confirmPassword: z.string().max(200),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });

export const changePasswordAction = formAction(changePasswordSchema, async (sessionUser, input) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new ValidationError("Your current password is incorrect.", { currentPassword: ["Incorrect password."] });
  }
  const problems = passwordProblems(input.newPassword);
  if (problems.length) throw new ValidationError("Choose a stronger password.", { newPassword: problems });
  if (await verifyPassword(input.newPassword, user.passwordHash)) {
    throw new ValidationError("Choose a password you haven't used here.", { newPassword: ["Must differ from the current password."] });
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword), passwordChangedAt: new Date() },
  });
  // Sign out every other device.
  await invalidateUserSessions(user.id, sessionUser.sessionId);
  await audit(sessionUser, {
    action: "auth.password_changed",
    module: "admin",
    entityType: "User",
    entityId: user.id,
    summary: `${user.name} changed their password (other sessions signed out)`,
  });
  return "Password updated. Other devices have been signed out.";
});

export const signOutOtherSessionsAction = formAction(z.object({}), async (user) => {
  await invalidateUserSessions(user.id, user.sessionId);
  await audit(user, {
    action: "auth.sessions_revoked",
    module: "admin",
    entityType: "User",
    entityId: user.id,
    summary: `${user.name} signed out all other sessions`,
  });
  return "Signed out of all other sessions.";
});
