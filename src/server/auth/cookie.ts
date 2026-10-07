/**
 * Session cookie settings. Kept free of database imports so the proxy can use
 * them without bundling Prisma.
 */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-ia_session" : "ia_session";

const DAY_MS = 24 * 60 * 60 * 1000;

export function sessionTtlMs(): number {
  const days = Number(process.env.SESSION_TTL_DAYS ?? 7);
  return (Number.isFinite(days) && days > 0 ? days : 7) * DAY_MS;
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
