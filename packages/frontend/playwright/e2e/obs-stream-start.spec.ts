import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { sessionManifestFilled } from "../fixtures/payloads/session";
import { routeTemplatesApi } from "../support/routes/template";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_DASHBOARD_GRID,
  TEST_ID_OBS_WIDGET,
  TEST_ID_MANAGE_STREAMS_BUTTON,
  TEST_ID_MANAGE_STREAMS_MODAL,
} from "../../src/constants/testIds";

// Use non-ADMIN user — ADMIN users navigate to /admin per Req 11.3
const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

test.describe("OBS stream start flow", () => {
  test("login → dashboard → metadata present → Manage Streams button visible", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    await routeSocketIo(page, undefined, sessionManifestFilled());

    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();

    // Auto-forward takes us straight to the dashboard (single dashboard)
    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(TEST_ID_OBS_WIDGET)).toBeVisible({ timeout: 5000 });

    // Manage Streams button should be visible (replaced Start Stream)
    await expect(page.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON)).toBeVisible({ timeout: 5000 });

    // Click opens the Manage Streams modal
    await page.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_MANAGE_STREAMS_MODAL)).toBeVisible({ timeout: 5000 });
  });
});
