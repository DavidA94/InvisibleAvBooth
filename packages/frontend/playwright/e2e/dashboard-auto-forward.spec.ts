import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";

test.describe("Dashboard auto-forward", () => {
  test("Flow 7: auto-selects single dashboard on initial login", async ({ page }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeDashboardApi(page);
    await routeSocketIo(page);

    // Override the default dashboard list to return exactly one
    await page.route("**/api/dashboards", async (route) => {
      if (route.request().method() === "GET" && !route.request().url().includes("/layout")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([{ id: "default", name: "Main Dashboard", description: "Primary" }]),
        });
      } else {
        await route.continue();
      }
    });

    // Login
    await page.goto("/login");
    await page.getByTestId("login-username").locator("input").fill("admin");
    await page.getByTestId("login-password").locator("input").fill("password");
    await page.getByTestId("login-submit").click();

    // Should auto-forward past dashboard selection to the dashboard itself
    await expect(page.getByTestId("dashboard-grid")).toBeVisible({ timeout: 15000 });
  });

  test("Flow 6: auto-navigates to cached dashboard on initial login", async ({ page }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeDashboardApi(page);
    await routeSocketIo(page);

    // Set cached dashboard ID before login
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("dashboardId", "default"));

    await page.getByTestId("login-username").locator("input").fill("admin");
    await page.getByTestId("login-password").locator("input").fill("password");
    await page.getByTestId("login-submit").click();

    // Should skip selection screen and go straight to the cached dashboard
    await expect(page.getByTestId("dashboard-grid")).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard\/default/);
  });
});
