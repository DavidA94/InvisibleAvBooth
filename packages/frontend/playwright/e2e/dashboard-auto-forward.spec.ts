import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";

test.describe("Dashboard auto-forward", () => {
  test("Flow 7: auto-selects single dashboard on initial login", async ({ page }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeSocketIo(page);

    // Return exactly one dashboard
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

    await page.route("**/api/dashboards/*/layout", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: 1,
          cells: [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" }],
        }),
      });
    });

    // Login
    await page.goto("/login");
    await page.getByTestId("login-username").locator("input").fill("admin");
    await page.getByTestId("login-password").locator("input").fill("password");
    await page.getByTestId("login-submit").click();

    // Should auto-forward past dashboard selection to the dashboard itself
    await expect(page.getByTestId("dashboard-grid")).toBeVisible({ timeout: 10000 });
  });

  test("Flow 6: auto-navigates to cached dashboard on initial login", async ({ page }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeSocketIo(page);

    await page.route("**/api/dashboards/*/layout", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: 1,
          cells: [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" }],
        }),
      });
    });

    // Set cached dashboard ID before login
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("dashboardId", "cached-dash"));

    await page.getByTestId("login-username").locator("input").fill("admin");
    await page.getByTestId("login-password").locator("input").fill("password");
    await page.getByTestId("login-submit").click();

    // Should skip selection screen and go straight to the cached dashboard
    await expect(page.getByTestId("dashboard-grid")).toBeVisible({ timeout: 10000 });
    // Verify it navigated to the cached ID
    await expect(page).toHaveURL(/\/dashboard\/cached-dash/);
  });
});
