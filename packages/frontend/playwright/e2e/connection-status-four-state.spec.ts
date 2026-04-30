import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { obsStateDefault } from "../fixtures/payloads/obs";
import { routeTemplatesApi } from "../support/routes/template";

test.describe("Connection status four-state dots", () => {
  test("healthy OBS shows green dot class", async ({ page }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    await routeSocketIo(page, obsStateDefault({ connected: true }));

    await page.goto("/login");
    await page.getByTestId("login-username").locator("input").fill("admin");
    await page.getByTestId("login-password").locator("input").fill("password");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("dashboard-grid")).toBeVisible({ timeout: 15000 });
    const indicators = page.getByTestId("connection-indicators");
    await expect(indicators).toBeVisible({ timeout: 5000 });
    await expect(indicators.locator(".widget-dot-healthy")).toBeVisible();
  });

  test("disconnected OBS shows unhealthy dot class", async ({ page }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    await routeSocketIo(page, obsStateDefault({ connected: false }));

    await page.goto("/login");
    await page.getByTestId("login-username").locator("input").fill("admin");
    await page.getByTestId("login-password").locator("input").fill("password");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("dashboard-grid")).toBeVisible({ timeout: 15000 });
    const indicators = page.getByTestId("connection-indicators");
    await expect(indicators).toBeVisible({ timeout: 5000 });
    await expect(indicators.locator(".widget-dot-unhealthy")).toBeVisible();
  });
});
