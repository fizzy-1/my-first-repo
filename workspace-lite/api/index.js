// Vercel runs the workspace as this one function (see vercel.json). The static pages come from public/.
import { handle } from "../server.js";

export default function handler(req, res) {
  // vercel.json rewrites /api/<path> to /api/index?__path=<path>; put the original address back.
  const url = new URL(req.url, "http://localhost");
  const routed = url.searchParams.get("__path");
  if (routed !== null) {
    url.searchParams.delete("__path");
    const query = url.searchParams.toString();
    req.url = (routed === "__health" ? "/health" : `/api/${routed}`) + (query ? `?${query}` : "");
  }
  return handle(req, res);
}
