import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { sessionManifestFilled } from "../fixtures/payloads/session";
import { routeTemplatesApi } from "../support/routes/template";

test.describe("OBS stream start flow", () => {
  test("login → dashboard → metadata present → Manage Streams button visible", async ({ page }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    await routeSocketIo(page, undefined, sessionManifestFilled());

    // Login
    await page.goto("/login");
    await page.getByTestId("login-username").locator("input").fill("admin");
    await page.getByTestId("login-password").locator("input").fill("password");
    await page.getByTestId("login-submit").click();

    // Auto-forward takes us straight to the dashboard (single dashboard)
    await expect(page.getByTestId("dashboard-grid")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("obs-widget")).toBeVisible({ timeout: 5000 });

    // Manage Streams button should be visible (replaced Start Stream)
    await expect(page.getByTestId("manage-streams-button")).toBeVisible({ timeout: 5000 });

    // Click opens the Manage Streams modal
    await page.getByTestId("manage-streams-button").click();
    await expect(page.getByTestId("manage-streams-modal")).toBeVisible({ timeout: 5000 });
  });
});
