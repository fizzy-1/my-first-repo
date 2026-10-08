import { NextResponse } from "next/server";
import { NO_STORE, requireBearer } from "@/server/auth/bearer";
import { runDeadlineSweep } from "@/server/jobs/deadlines";

export const dynamic = "force-dynamic";

/**
 * Deadline sweep trigger for an external scheduler:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/deadlines
 * Idempotent, so it can run hourly or daily. Responds with the sweep's counts.
 */
export async function POST(request: Request) {
  const denied = requireBearer(request, process.env.CRON_SECRET, "CRON_SECRET");
  if (denied) return denied;
  try {
    const summary = await runDeadlineSweep();
    return NextResponse.json({ ok: true, summary }, { headers: NO_STORE });
  } catch (error) {
    console.error("[cron/deadlines] sweep failed", error);
    return NextResponse.json({ error: "The deadline sweep failed. See the server logs." }, { status: 500, headers: NO_STORE });
  }
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed. Use POST." }, { status: 405, headers: { ...NO_STORE, Allow: "POST" } });
}
