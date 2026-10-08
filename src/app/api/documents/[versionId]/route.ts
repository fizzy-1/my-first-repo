import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/server/audit";
import { getApiUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors";
import { getVersionForDownload } from "@/server/services/documents";
import { ALLOWED_TYPES, storage } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * Authenticated file delivery. Every request re-checks that the user can see
 * the document; files are never served from a public path. `?inline=1` is
 * honoured only for previewable types (PDF, images, plain text).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/[versionId]">) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { versionId } = await ctx.params;
  let version: Awaited<ReturnType<typeof getVersionForDownload>>;
  try {
    version = await getVersionForDownload(user, versionId);
  } catch (error) {
    if (isAppError(error)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
  const file = await storage().get(version.storageKey);
  if (!file) return NextResponse.json({ error: "File missing from storage" }, { status: 410 });

  const inline = request.nextUrl.searchParams.get("inline") === "1" && ALLOWED_TYPES[version.mimeType]?.preview;
  if (version.document.accessLevel === "EXECUTIVE" || version.document.accessLevel === "RESTRICTED") {
    await audit(user, {
      action: inline ? "document.viewed" : "document.downloaded",
      module: "documents",
      entityType: "Document",
      entityId: version.document.id,
      summary: `${user.name} ${inline ? "viewed" : "downloaded"} “${version.document.title}” (v${version.version})`,
    });
  }
  const encoded = encodeURIComponent(version.fileName);
  return new NextResponse(file.stream, {
    headers: {
      "Content-Type": version.mimeType === "text/plain" || version.mimeType === "text/csv" ? `${version.mimeType}; charset=utf-8` : version.mimeType,
      "Content-Length": String(file.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${version.fileName.replace(/"/g, "")}"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Allow same-origin framing for the in-app preview, but nothing can execute.
      // (Chrome's PDF viewer cannot run in a sandboxed document, so PDFs omit `sandbox`.)
      "Content-Security-Policy":
        version.mimeType === "application/pdf"
          ? "frame-ancestors 'self'; object-src 'self'"
          : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'self'",
      "X-Frame-Options": "SAMEORIGIN",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
