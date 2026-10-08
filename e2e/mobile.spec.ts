import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const PAGES = ["/dashboard", "/approvals", "/tasks", "/notifications", "/meetings", "/finance", "/schools", "/documents", "/calendar"];

test("key pages fit a phone screen without horizontal scrolling", async ({ page }) => {
  await signIn(page, "sipho@integral.demo");
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
});

test("urgent items come first on the phone dashboard", async ({ page }) => {
  await signIn(page, "sipho@integral.demo");
  const labels = await page.$$eval("main section[aria-label]", (sections) =>
    sections
      .map((s) => ({ label: s.getAttribute("aria-label") ?? "", top: s.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top)
      .map((s) => s.label),
  );
  expect(labels.slice(0, 3)).toEqual(["Key metrics", "Executive action centre", "My tasks & meetings"]);
});

test("navigation opens from the menu button", async ({ page }) => {
  await signIn(page, "sipho@integral.demo");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Approvals" }).click();
  await expect(page).toHaveURL(/\/approvals/);
});
