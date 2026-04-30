import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";

test.describe("Admin index navigation", () => {
  test("ADMIN user sees Admin Pages link in title bar", async ({ page }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeDashboardApi(page);
    await routeSocketIo(page);

    await page.goto("/login");
    await page.getByTestId("login-username").locator("input").fill("admin");
    await page.getByTestId("login-password").locator("input").fill("password");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("dashboard-grid")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("title-bar-admin-link")).toBeVisible({ timeout: 5000 });
  });
});
