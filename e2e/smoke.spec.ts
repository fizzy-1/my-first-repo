import { expect, test } from "@playwright/test";
import { signIn, trackPageErrors } from "./helpers";

/** Every module a role should reach renders its heading without client errors. */
const JOURNEYS: { email: string; paths: string[] }[] = [
  {
    email: "sipho@integral.demo",
    paths: [
      "/dashboard",
      "/intelligence",
      "/tasks",
      "/finance",
      "/finance/cash-flow",
      "/finance/budgets",
      "/finance/projections",
      "/schools",
      "/marketing",
      "/academic",
      "/technology",
      "/team",
      "/documents",
      "/calendar",
      "/approvals",
      "/meetings",
      "/strategy",
      "/notifications",
      "/profile",
      "/admin/users",
      "/admin/audit",
    ],
  },
  { email: "nomvula@integral.demo", paths: ["/dashboard", "/academic", "/academic/hours", "/meetings", "/documents"] },
  { email: "kagiso@integral.demo", paths: ["/dashboard", "/technology", "/technology/bugs", "/tasks", "/calendar"] },
  { email: "tshepo@integral.demo", paths: ["/dashboard", "/marketing", "/tasks", "/approvals"] },
];

for (const journey of JOURNEYS) {
  test(`pages render for ${journey.email}`, async ({ page }) => {
    const errors = trackPageErrors(page);
    await signIn(page, journey.email);
    for (const path of journey.paths) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page, path).not.toHaveURL(/access-denied|\/login/);
      await expect(page.locator("main h1").first(), path).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test("a task can be created, completed and deleted", async ({ page }) => {
  const title = `E2E smoke task ${Date.now()}`;
  await signIn(page, "pieter@integral.demo");
  await page.goto("/tasks?new=task");
  const dialog = page.getByRole("dialog");
  await dialog.locator("input[name=title]").fill(title);
  await dialog.getByRole("button", { name: /create|save/i }).click();
  await expect(page.getByText(title).first()).toBeVisible();

  await page.getByRole("link", { name: title }).first().click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: /delete/i }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: /delete/i }).click();
  await expect(page).toHaveURL(/\/tasks/);
  await page.goto(`/tasks?q=${encodeURIComponent(title)}`);
  await expect(page.getByText(title)).toHaveCount(0);
});
