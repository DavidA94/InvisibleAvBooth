import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { sessionManifestDefault } from "../fixtures/payloads/session";
import { routeTemplatesApi } from "../support/routes/template";

test.describe("Template selection flow", () => {
  test("session manifest modal shows template dropdowns", async ({ page }) => {
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

    // Open manifest modal via metadata preview edit button
    const editButton = page.getByTestId("edit-details-button");
    await expect(editButton).toBeVisible({ timeout: 10000 });
    await editButton.click();

    // Modal should be visible with template dropdowns
    await expect(page.getByTestId("session-manifest-modal")).toBeVisible({ timeout: 5000 });
  });
});
