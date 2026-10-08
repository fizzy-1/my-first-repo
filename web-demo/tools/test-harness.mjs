// Serves the web demo locally and screenshots routes, mapping CDN scripts to local vendor copies.
import { chromium } from "../../node_modules/playwright/index.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const SHOTS = process.env.SHOTS || "/tmp/web-demo-shots";
fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end("not found"); }
  let body = fs.readFileSync(f);
  // The artifact host wraps the page in a document skeleton; emulate it.
  if (p === "/index.html") body = Buffer.from(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${body}</body></html>`);
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  res.end(body);
}).listen(0);
const port = server.address().port;
const VENDOR = { "react.production.min.js": "react.production.min.js", "react-dom.production.min.js": "react-dom.production.min.js", "htm.umd.js": "htm.umd.js" };
const [persona = "sipho", ...paths] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const results = [];
for (const scheme of (process.env.SCHEMES || "dark").split(",")) {
  const ctx = await browser.newContext({ viewport: { width: Number(process.env.W || 1440), height: 900 }, colorScheme: scheme });
  await ctx.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com/, (route) => {
    const name = route.request().url().split("/").pop();
    if (VENDOR[name]) return route.fulfill({ path: `${ROOT}/vendor/${VENDOR[name]}`, contentType: "text/javascript" });
    return route.abort();
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript((p) => { try { localStorage.setItem("ia-web-demo-v1", JSON.stringify({ persona: p, patches: {}, created: {}, deleted: {}, read: {}, log: [] })); } catch {} }, persona);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|ERR_FAILED/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });
  for (const p of paths.length ? paths : ["/dashboard"]) {
    await page.goto(`http://localhost:${port}/#${p}`);
    await page.waitForTimeout(Number(process.env.WAIT || 900));
    const name = `wd_${persona}_${p.replace(/[^a-z0-9]+/gi, "_")}_${scheme}${process.env.TAG || ""}`;
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: process.env.FULL === "1" });
    const h1 = await page.locator("h1").first().textContent().catch(() => null);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${scheme} ${p} → h1="${h1}" overflow=${overflow}`);
  }
  console.log(errors.length ? errors.join("\n") : "no browser errors");
  await ctx.close();
}
await browser.close();
server.close();
