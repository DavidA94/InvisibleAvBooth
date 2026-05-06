import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { sessionManifestFilled, sessionManifestDefault } from "../fixtures/payloads/session";
import { routeTemplatesApi } from "../support/routes/template";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_DASHBOARD_GRID,
  TEST_ID_MANAGE_STREAMS_BUTTON,
} from "../../src/constants/testIds";

// Use non-ADMIN user — ADMIN users navigate to /admin per Req 11.3
const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

test.describe("Manage Streams button states", () => {
  test("shows Manage Streams button when OBS connected", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    await routeSocketIo(page, undefined, sessionManifestFilled());

    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();

    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON)).toBeVisible({ timeout: 5000 });
  });

  test("shows sub-label when manifest not ready", async ({ page }) => {
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
    const button = page.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON);
    await expect(button).toBeVisible({ timeout: 5000 });
    await expect(button).toContainText("Enter metadata");
  });
});
