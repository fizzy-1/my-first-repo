import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("authentication", () => {
  test("unauthenticated pages redirect to sign-in and return afterwards", async ({ page }) => {
    await page.goto("/finance");
    await expect(page).toHaveURL(/\/login\?next=%2Ffinance/);
    await page.fill("#email", "ayesha@integral.demo");
    await page.fill("#password", process.env.SEED_DEMO_PASSWORD ?? "Integral!2026");
    await page.click("button[type=submit]");
    await expect(page).toHaveURL(/\/finance$/);
  });

  test("wrong password is rejected without revealing whether the account exists", async ({ page }) => {
    // Uses an account no other test signs in with, so repeated runs can't lock a shared account.
    const formAlert = page.locator("form [role=alert]");
    await page.goto("/login");
    await page.fill("#email", "nobody@integral.demo");
    await page.fill("#password", "not-the-password");
    await page.click("button[type=submit]");
    await expect(formAlert).toBeVisible();
    const unknownAccount = await formAlert.textContent();

    await page.fill("#email", "megan@integral.demo");
    await page.fill("#password", "not-the-password");
    await page.click("button[type=submit]");
    await expect(formAlert).toHaveText(unknownAccount ?? "");
    await expect(page).toHaveURL(/\/login/);

    // A successful sign-in resets the account's failure counter for the next run.
    await page.fill("#email", "megan@integral.demo");
    await page.fill("#password", process.env.SEED_DEMO_PASSWORD ?? "Integral!2026");
    await page.click("button[type=submit]");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("off-site next parameters are ignored", async ({ page }) => {
    await page.goto("/login?next=https://evil.example/");
    await page.fill("#email", "sipho@integral.demo");
    await page.fill("#password", process.env.SEED_DEMO_PASSWORD ?? "Integral!2026");
    await page.click("button[type=submit]");
    await expect(page).toHaveURL(/localhost|\/dashboard/);
    expect(new URL(page.url()).hostname).not.toBe("evil.example");
  });

  test("signing out ends the session", async ({ page }) => {
    await signIn(page, "pieter@integral.demo");
    await page.getByRole("button", { name: "Log out" }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
