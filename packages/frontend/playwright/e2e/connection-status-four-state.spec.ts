import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { obsStateDefault } from "../fixtures/payloads/obs";
import { routeTemplatesApi } from "../support/routes/template";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_DASHBOARD_GRID,
  TEST_ID_CONNECTION_INDICATORS,
} from "../../src/constants/testIds";

// Use non-ADMIN user — ADMIN users navigate to /admin per Req 11.3
const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

test.describe("Connection status four-state dots", () => {
  test("healthy OBS shows green dot class", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    await routeSocketIo(page, obsStateDefault({ connected: true }));

    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();

    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });
    const indicators = page.getByTestId(TEST_ID_CONNECTION_INDICATORS);
    await expect(indicators).toBeVisible({ timeout: 5000 });
    await expect(indicators.locator(".widget-dot-healthy")).toBeVisible();
  });

  test("disconnected OBS shows unhealthy dot class", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    await routeSocketIo(page, obsStateDefault({ connected: false }));

    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();

    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });
    const indicators = page.getByTestId(TEST_ID_CONNECTION_INDICATORS);
    await expect(indicators).toBeVisible({ timeout: 5000 });
    await expect(indicators.locator(".widget-dot-unhealthy")).toBeVisible();
  });
});
