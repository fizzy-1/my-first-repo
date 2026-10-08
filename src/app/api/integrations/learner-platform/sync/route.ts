import { NextResponse } from "next/server";
import type { z } from "zod";
import { syncLearnerPlatform, syncPayloadSchema } from "@/server/integrations/learner-platform/sync";
import { NO_STORE, requireBearer } from "@/server/auth/bearer";

export const dynamic = "force-dynamic";

/**
 * Ingestion endpoint for the learner-facing platform (or its ETL job):
 *   POST with `Authorization: Bearer $LEARNER_PLATFORM_SYNC_TOKEN` and a JSON
 *   body matching `syncPayloadSchema`. Records are upserted by external id, so
 *   re-sending a batch is safe. Disabled (503) while the token is unset.
 */

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_REPORTED_ISSUES = 100;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const tooLarge = () => json({ error: `Request body exceeds ${MAX_BODY_BYTES / 1024 / 1024} MB. Send smaller batches.` }, 413);

/** Reads the body, giving up as soon as it grows past `limit` bytes (Content-Length can be absent or wrong). */
async function readBody(request: Request, limit: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Zod issues keyed by their dotted path, e.g. { "learners.3.grade": ["Too big: expected number to be <=12"] }. */
function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues.slice(0, MAX_REPORTED_ISSUES)) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export async function POST(request: Request) {
  const denied = requireBearer(request, process.env.LEARNER_PLATFORM_SYNC_TOKEN, "LEARNER_PLATFORM_SYNC_TOKEN");
  if (denied) return denied;

  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) {
    return json({ error: "Content-Type must be application/json." }, 415);
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return tooLarge();
  const raw = await readBody(request, MAX_BODY_BYTES);
  if (raw === null) return tooLarge();

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    return json({ error: "The request body is not valid UTF-8 JSON." }, 400);
  }
  const parsed = syncPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "The payload does not match the sync schema.", fieldErrors: fieldErrors(parsed.error), issueCount: parsed.error.issues.length }, 400);
  }

  try {
    const result = await syncLearnerPlatform(parsed.data);
    return json({ ok: true, ...result });
  } catch (error) {
    console.error("[integrations/learner-platform] sync failed", error);
    return json({ error: "The sync failed. Records are upserted by external id, so the batch can be retried safely." }, 500);
  }
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed. Use POST." }, { status: 405, headers: { ...NO_STORE, Allow: "POST" } });
}
