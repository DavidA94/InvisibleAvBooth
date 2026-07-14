import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo } from "../support/routes/obs";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { TEST_ID_LOGIN_USERNAME, TEST_ID_LOGIN_PASSWORD, TEST_ID_LOGIN_SUBMIT, TEST_ID_ADMIN_INDEX_PAGE } from "../../src/constants/testIds";

test.describe("ADMIN login redirect to /admin", () => {
  test("ADMIN user is redirected to /admin after login (not dashboard selection)", async ({ page }) => {
    const adminLogin = authLoginSuccess({ role: "ADMIN" });
    await routeAuthLogin(page, adminLogin);
    await routeAuthCheck(page, adminLogin);
    await routeSocketIo(page);

    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("admin");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();

    // ADMIN users should land on /admin (not dashboard selection)
    await expect(page.getByTestId(TEST_ID_ADMIN_INDEX_PAGE)).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/admin/);
  });

  test("non-ADMIN user does NOT redirect to /admin", async ({ page }) => {
    const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeSocketIo(page);

    await page.route("**/api/dashboards", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            { id: "d1", name: "Main", description: "Primary" },
            { id: "d2", name: "Secondary", description: "Backup" },
          ]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();

    // Should NOT go to /admin
    await expect(page).not.toHaveURL(/\/admin/, { timeout: 5000 });
  });
});
