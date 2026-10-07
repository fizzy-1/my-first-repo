import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/current-user";
import { globalSearch } from "@/server/services/search";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const groups = await globalSearch(user, q);
  return NextResponse.json({ groups }, { headers: { "Cache-Control": "private, no-store" } });
}
