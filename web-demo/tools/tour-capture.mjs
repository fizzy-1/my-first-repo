// Captures the MVP tour screenshots: node tour-capture.mjs <spec.json>
import { chromium } from "/home/user/my-first-repo/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";
const SP = "/tmp/claude-0/-home-user-my-first-repo/c99faef3-0027-5e1f-991e-d94ee4aee220/scratchpad";
const base = process.env.BASE ?? "http://localhost:3000";
const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const results = [];
for (const group of spec) {
  const ctx = await browser.newContext({ viewport: group.viewport ?? { width: 1440, height: 900 }, deviceScaleFactor: group.scale ?? 1, isMobile: !!group.mobile, hasTouch: !!group.mobile });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, group.theme ?? "dark");
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (group.login !== false) {
    await page.goto(`${base}/login`);
    await page.fill("#email", group.email);
    await page.fill("#password", "Integral!2026");
    await Promise.all([page.waitForURL(/dashboard/, { timeout: 90000 }), page.click("button[type=submit]")]);
  }
  for (const shot of group.shots) {
    const res = await page.goto(base + shot.path, { waitUntil: "load", timeout: 120000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(shot.wait ?? 700);
    if (shot.click) { await page.locator(shot.click).first().click().catch(() => {}); await page.waitForTimeout(600); }
    const file = `${SP}/tour/${shot.id}.png`;
    await page.screenshot({ path: file, fullPage: !!shot.full, clip: shot.clip });
    results.push({ id: shot.id, status: res?.status(), url: page.url() });
    console.log(shot.id, res?.status(), page.url().replace(base, ""));
  }
  if (errors.length) console.log("ERRORS", group.email, errors.slice(0, 5));
  await ctx.close();
}
await browser.close();
