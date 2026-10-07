import { Prisma } from "@prisma/client";
import { db, type DbClient } from "@/server/db";
import { getRequestMeta } from "@/server/auth/current-user";

type Actor = { id: string } | null;

export interface AuditEntry {
  action: string;
  module: string;
  entityType: string;
  entityId?: string | null;
  /** Human-readable sentence, e.g. "Michael Naidoo approved expense #102". */
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Also show this entry in the dashboard's Recent Activity feed. */
  feed?: boolean;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Converts Prisma values (Decimal, Date, nested objects) into plain JSON. */
export function toAuditJson(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return Number((value as Prisma.Decimal).toString());
  if (Array.isArray(value)) return value.map(toAuditJson);
  if (typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[key] = toAuditJson(v);
    }
    return out;
  }
  if (typeof value === "bigint") return value.toString();
  return value as JsonValue;
}

/**
 * Returns only the fields that changed between two snapshots, as a
 * { before, after } pair ready for the audit log.
 */
export function diffFields(
  before: object,
  after: object,
  keys: readonly string[] = Object.keys(after),
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const prev = before as Record<string, unknown>;
  const next = after as Record<string, unknown>;
  for (const key of keys) {
    if (!(key in next)) continue;
    const oldValue = toAuditJson(prev[key]);
    const newValue = toAuditJson(next[key]);
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      b[key] = oldValue;
      a[key] = newValue;
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

/** Appends an entry to the audit trail. Pass a transaction client to make it atomic with the change. */
export async function audit(actor: Actor, entry: AuditEntry, client: DbClient = db) {
  const { ipAddress } = await getRequestMeta();
  await client.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      action: entry.action,
      module: entry.module,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary.slice(0, 500),
      before: entry.before ? (toAuditJson(entry.before) as Prisma.InputJsonValue) : Prisma.DbNull,
      after: entry.after ? (toAuditJson(entry.after) as Prisma.InputJsonValue) : Prisma.DbNull,
      ipAddress,
      feed: entry.feed ?? false,
    },
  });
}
