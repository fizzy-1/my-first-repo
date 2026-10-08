import { timingSafeEqual } from "node:crypto";

/**
 * Bearer-token authentication for machine-to-machine endpoints (the deadline
 * cron trigger and the learner-platform sync). There is no user session on
 * these requests: the caller proves itself with a shared secret from the
 * environment, compared in constant time.
 */

export type BearerCheck = "ok" | "unconfigured" | "unauthorized";

/** Longer Authorization headers are rejected outright (real tokens are ~64 characters). */
const MAX_HEADER_LENGTH = 1024;

export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Extracts the token from an `Authorization: Bearer <token>` header (the scheme is case-insensitive). */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header || header.length > MAX_HEADER_LENGTH) return null;
  const match = /^Bearer +(\S+) *$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * Constant-time string comparison. `timingSafeEqual` only accepts equal-length
 * buffers, so on a length mismatch the expected value is compared with itself
 * (the same amount of work) before failing: the response time reveals at most
 * that the length differs, never how much of the token matched.
 */
export function safeEqual(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Checks an Authorization header against a secret. A blank secret disables the endpoint. */
export function checkBearer(header: string | null | undefined, secret: string | undefined): BearerCheck {
  const expected = secret?.trim();
  if (!expected) return "unconfigured";
  const token = bearerToken(header);
  return token !== null && safeEqual(token, expected) ? "ok" : "unauthorized";
}

/**
 * For route handlers: returns the error response to send (503 when the secret
 * is not configured, 401 when the token is missing or wrong), or null when the
 * request is authorised.
 */
export function requireBearer(request: Request, secret: string | undefined, secretName: string): Response | null {
  const result = checkBearer(request.headers.get("authorization"), secret);
  if (result === "ok") return null;
  if (result === "unconfigured") {
    return Response.json({ error: `This endpoint is disabled until ${secretName} is set.` }, { status: 503, headers: NO_STORE });
  }
  return Response.json(
    { error: "Unauthorized" },
    { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="integral-workspace"' } },
  );
}
