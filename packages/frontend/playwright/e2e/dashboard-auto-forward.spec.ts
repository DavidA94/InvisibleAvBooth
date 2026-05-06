import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { TEST_ID_LOGIN_USERNAME, TEST_ID_LOGIN_PASSWORD, TEST_ID_LOGIN_SUBMIT, TEST_ID_DASHBOARD_GRID } from "../../src/constants/testIds";

// Use non-ADMIN user — ADMIN users navigate to /admin per Req 11.3
const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

test.describe("Dashboard auto-forward", () => {
  test("Flow 7: auto-selects single dashboard on initial login", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeSocketIo(page);

    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();

    // Should auto-forward past dashboard selection to the dashboard itself
    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });
  });

  test("Flow 6: auto-navigates to cached dashboard on initial login", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeSocketIo(page);

    // Set cached dashboard ID before login
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("dashboardId", "default"));

    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();

    // Should skip selection screen and go straight to the cached dashboard
    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard\/default/);
  });
});
