import { NextResponse } from "next/server";
import { getApiUser } from "@/server/auth/current-user";
import { getNotificationSummary } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const summary = await getNotificationSummary(user);
  return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } });
}
