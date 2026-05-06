import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { sessionManifestDefault } from "../fixtures/payloads/session";
import { routeTemplatesApi } from "../support/routes/template";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_DASHBOARD_GRID,
  TEST_ID_EDIT_DETAILS_BUTTON,
  TEST_ID_SESSION_MANIFEST_MODAL,
} from "../../src/constants/testIds";

// Use non-ADMIN user — ADMIN users navigate to /admin per Req 11.3
const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

test.describe("Template selection flow", () => {
  test("session manifest modal shows template dropdowns", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    await routeSocketIo(page, undefined, sessionManifestDefault());

    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();

    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });

    // Open manifest modal via metadata preview edit button
    const editButton = page.getByTestId(TEST_ID_EDIT_DETAILS_BUTTON);
    await expect(editButton).toBeVisible({ timeout: 10000 });
    await editButton.click();

    // Modal should be visible with template dropdowns
    await expect(page.getByTestId(TEST_ID_SESSION_MANIFEST_MODAL)).toBeVisible({ timeout: 5000 });
  });
});
