import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { sessionManifestFilled } from "../fixtures/payloads/session";
import { obsStateLive } from "../fixtures/payloads/obs";

test.describe("OBS stream start flow", () => {
  test.skip("login → dashboard → metadata present → Start Stream → confirm → stream live", async ({ page }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeDashboardApi(page);
    const socket = await routeSocketIo(page, undefined, sessionManifestFilled());

    // Login
    await page.goto("/login");
    await page.getByTestId("login-username").locator("input").fill("admin");
    await page.getByTestId("login-password").locator("input").fill("password");
    await page.getByTestId("login-submit").click();

    // Select dashboard
    await expect(page.getByTestId("dashboard-selection-screen")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("dashboard-option").first().click();

    // Wait for dashboard grid and OBS widget
    await expect(page.getByTestId("dashboard-grid")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("obs-widget")).toBeVisible({ timeout: 10000 });

    // Wait for OBS to show as connected (socket sends initial state)
    await expect(page.getByTestId("widget-error-overlay")).not.toBeVisible({ timeout: 5000 });

    // Metadata should be present — Start Stream should be available
    await page.getByTestId("obs-stream-btn").click();

    // Confirmation modal should appear
    await expect(page.getByTestId("confirmation-confirm-btn")).toBeVisible();
    await page.getByTestId("confirmation-confirm-btn").click();

    // Simulate server pushing live state
    socket.sendObsState(obsStateLive());

    // Verify stream is live
    await expect(page.getByTestId("stream-status")).toContainText("LIVE", { timeout: 5000 });
  });
});
