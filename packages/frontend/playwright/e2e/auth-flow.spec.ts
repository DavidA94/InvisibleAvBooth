import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthLoginFailure, routeAuthLogout, routeAuthCheck, routeChangePassword } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { authLoginRequiresPasswordChange } from "../fixtures/payloads/auth";

test.describe("Authentication flow", () => {
  test("login success navigates to dashboard selection", async ({ page }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeDashboardApi(page);
    await routeSocketIo(page);

    await page.goto("/login");
    await page.getByTestId("login-username").locator("input").fill("admin");
    await page.getByTestId("login-password").locator("input").fill("password");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("dashboard-selection-screen")).toBeVisible({ timeout: 10000 });
  });

  test("login failure shows error message", async ({ page }) => {
    await routeAuthLoginFailure(page);

    await page.goto("/login");
    await page.getByTestId("login-username").locator("input").fill("wrong");
    await page.getByTestId("login-password").locator("input").fill("wrong");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("login-error")).toBeVisible();
    await expect(page.getByTestId("login-error")).toContainText("Invalid credentials");
  });

  test("logout redirects to login", async ({ page }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeDashboardApi(page);
    await routeSocketIo(page);
    await routeAuthLogout(page);

    // Login first
    await page.goto("/login");
    await page.getByTestId("login-username").locator("input").fill("admin");
    await page.getByTestId("login-password").locator("input").fill("password");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("dashboard-selection-screen")).toBeVisible({ timeout: 10000 });

    // Logout
    await page.getByTestId("title-bar-logout-btn").click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("requiresPasswordChange redirects to change-password", async ({ page }) => {
    await routeAuthLogin(page, authLoginRequiresPasswordChange());
    await routeAuthCheck(page, authLoginRequiresPasswordChange());
    await routeChangePassword(page);
    await routeDashboardApi(page);
    await routeSocketIo(page);

    await page.goto("/login");
    await page.getByTestId("login-username").locator("input").fill("admin");
    await page.getByTestId("login-password").locator("input").fill("password");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("change-password-page")).toBeVisible({ timeout: 10000 });
  });

  test("session persistence — authenticated user skips login", async ({ page }) => {
    await routeAuthCheck(page);
    await routeDashboardApi(page);
    await routeSocketIo(page);

    // Simulate existing session by setting store state via evaluate
    await page.goto("/login");
    // The auth check route returns a valid user, so ProtectedRoutes should redirect
    await page.goto("/dashboards");
    await expect(page.getByTestId("dashboard-selection-screen")).toBeVisible({ timeout: 10000 });
  });
});
