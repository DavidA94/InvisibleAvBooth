import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { sessionManifestFilled, sessionManifestDefault } from "../fixtures/payloads/session";
import { routeTemplatesApi } from "../support/routes/template";

test.describe("Manage Streams button states", () => {
  test("shows Manage Streams button when OBS connected", async ({ page }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    await routeSocketIo(page, undefined, sessionManifestFilled());

    await page.goto("/login");
    await page.getByTestId("login-username").locator("input").fill("admin");
    await page.getByTestId("login-password").locator("input").fill("password");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("dashboard-grid")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("manage-streams-button")).toBeVisible({ timeout: 5000 });
  });

  test("shows sub-label when manifest not ready", async ({ page }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    await routeSocketIo(page, undefined, sessionManifestDefault());

    await page.goto("/login");
    await page.getByTestId("login-username").locator("input").fill("admin");
    await page.getByTestId("login-password").locator("input").fill("password");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("dashboard-grid")).toBeVisible({ timeout: 15000 });
    const button = page.getByTestId("manage-streams-button");
    await expect(button).toBeVisible({ timeout: 5000 });
    await expect(button).toContainText("Enter metadata");
  });
});
