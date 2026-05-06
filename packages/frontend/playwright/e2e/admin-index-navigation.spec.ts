import { test, expect } from "@playwright/test";
import { routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo } from "../support/routes/obs";
import { TEST_ID_TITLE_BAR_ADMIN_LINK, TEST_ID_ADMIN_INDEX_PAGE } from "../../src/constants/testIds";

test.describe("Admin index navigation", () => {
  test("ADMIN user sees Admin Pages link in title bar", async ({ page, context }) => {
    await routeAuthCheck(page);
    await routeSocketIo(page);

    // Set auth cookie so ProtectedRoutes allows access (Req 11.3: ADMIN → /admin)
    await context.addCookies([
      {
        name: "user_info",
        value: encodeURIComponent(JSON.stringify({ id: "u1", username: "admin", role: "ADMIN" })),
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/admin");

    // Req 11.3: ADMIN users land on /admin. The admin index page and title bar link are visible.
    await expect(page.getByTestId(TEST_ID_ADMIN_INDEX_PAGE)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(TEST_ID_TITLE_BAR_ADMIN_LINK)).toBeVisible({ timeout: 5000 });
  });
});
