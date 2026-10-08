import { NextResponse } from "next/server";

/** Unknown API paths get a JSON 404 rather than falling through to the workspace's page routes. */
function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export { notFound as DELETE, notFound as GET, notFound as HEAD, notFound as OPTIONS, notFound as PATCH, notFound as POST, notFound as PUT };
