import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("role-based access", () => {
  test("a tutor cannot reach finance, admin or exports", async ({ page }) => {
    await signIn(page, "bongani@integral.demo");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Finance" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Administration" })).toHaveCount(0);

    await page.goto("/finance");
    await expect(page).toHaveURL(/\/access-denied/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/access-denied/);

    const exportResponse = await page.request.get("/api/reports/expenses");
    expect(exportResponse.status()).toBe(403);
  });

  test("restricted documents are invisible to people without a grant", async ({ page }) => {
    await signIn(page, "johan@integral.demo");
    const download = await page.request.get("/api/documents/demo_dv_00dtu");
    expect(download.status()).toBe(404);
    await page.goto("/documents/demo_doc_00dtt");
    await expect(page.getByText("Director Remuneration Schedule")).toHaveCount(0);
  });

  test("salaries are hidden without sensitive team access", async ({ page }) => {
    await signIn(page, "pieter@integral.demo");
    await page.goto("/team");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Department cost totals and individual salaries only render with team.read.sensitive.
    await expect(page.getByText(/\/mo$/)).toHaveCount(0);
    await expect(page.getByText(/R\s?38[\s,]000/)).toHaveCount(0);
  });

  test("the finance executive sees finance but not user administration", async ({ page }) => {
    await signIn(page, "ayesha@integral.demo");
    await page.goto("/finance");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/access-denied/);
  });
});
