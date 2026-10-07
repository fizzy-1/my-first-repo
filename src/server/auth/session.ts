import { createHash, randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { sessionTtlMs } from "./cookie";

/**
 * Database-backed sessions.
 *
 * The browser holds an opaque 256-bit random token in an httpOnly cookie; the
 * database stores only its SHA-256 hash. Sessions slide forward while in use,
 * are capped at an absolute lifetime, and can be revoked instantly (logout,
 * suspension, password change) — something stateless JWTs cannot offer.
 */

export { SESSION_COOKIE, sessionCookieOptions, sessionTtlMs } from "./cookie";

const DAY_MS = 24 * 60 * 60 * 1000;
const ABSOLUTE_LIFETIME_MS = 30 * DAY_MS;
const LAST_SEEN_RESOLUTION_MS = 5 * 60 * 1000;

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, meta: { ipAddress?: string | null; userAgent?: string | null }) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  await db.session.create({
    data: {
      id: hashSessionToken(token),
      userId,
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });
  return { token, expiresAt };
}

const sessionInclude = {
  user: {
    include: {
      department: { select: { id: true, name: true, slug: true } },
      role: { include: { permissions: { include: { permission: { select: { key: true } } } } } },
    },
  },
} as const;

/**
 * Validates a raw session token. Returns the session with its user, role and
 * permissions, or null when the token is unknown, expired, past its absolute
 * lifetime, or belongs to a user who is no longer active.
 */
export async function validateSessionToken(token: string) {
  if (!token || token.length > 128) return null;
  const id = hashSessionToken(token);
  const session = await db.session.findUnique({ where: { id }, include: sessionInclude });
  if (!session) return null;

  const now = Date.now();
  const expired = session.expiresAt.getTime() <= now || session.createdAt.getTime() + ABSOLUTE_LIFETIME_MS <= now;
  if (expired || session.user.status !== "ACTIVE") {
    await db.session.delete({ where: { id } }).catch(() => undefined);
    return null;
  }

  const ttl = sessionTtlMs();
  const shouldExtend = session.expiresAt.getTime() - now < ttl / 2;
  const shouldTouch = now - session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS;
  if (shouldExtend || shouldTouch) {
    const expiresAt = shouldExtend
      ? new Date(Math.min(now + ttl, session.createdAt.getTime() + ABSOLUTE_LIFETIME_MS))
      : session.expiresAt;
    await db.session.update({ where: { id }, data: { lastSeenAt: new Date(now), expiresAt } });
    session.expiresAt = expiresAt;
  }
  return session;
}

export type ValidatedSession = NonNullable<Awaited<ReturnType<typeof validateSessionToken>>>;

export async function invalidateSession(sessionId: string) {
  await db.session.deleteMany({ where: { id: sessionId } });
}

export async function invalidateUserSessions(userId: string, exceptSessionId?: string) {
  await db.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
}
