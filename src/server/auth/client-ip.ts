/**
 * The left-most X-Forwarded-For entries are whatever the client sent, so they can't
 * be trusted for rate limiting. Each trusted proxy appends the address it saw; with
 * TRUSTED_PROXY_HOPS proxies in front of the app (default 1, e.g. a load balancer or
 * Next.js itself), the real client is that many entries from the right.
 */
export function clientIp(forwardedFor: string | null, realIp: string | null, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string | null {
  const entries = (forwardedFor ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  const trustedHops = Number.isInteger(hops) && hops > 0 ? hops : 1;
  if (entries.length) return entries[Math.max(0, entries.length - trustedHops)];
  return realIp?.trim() || null;
}
