import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_TITLE_BAR_ADMIN_LINK,
  TEST_ID_ADMIN_INDEX_PAGE,
} from "../../src/constants/testIds";

test.describe("Admin index navigation", () => {
  test("ADMIN user sees Admin Pages link in title bar", async ({ page }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeDashboardApi(page);
    await routeSocketIo(page);

    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("admin");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();

    // ADMIN users are redirected to /admin (Req 11.3 from multi-platform-streaming spec).
    // The title bar (and its Admin Pages link) is visible on the admin page.
    await expect(page.getByTestId(TEST_ID_ADMIN_INDEX_PAGE)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(TEST_ID_TITLE_BAR_ADMIN_LINK)).toBeVisible({ timeout: 5000 });
  });
});
